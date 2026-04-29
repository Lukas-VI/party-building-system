const { query, first } = require('../db');
const { getStepDetail } = require('../workflow-config');
const { now, parseJson, errorWithStatus } = require('../lib/utils');
const { ALLOWED_REVIEW_STATUSES, MVP_MAX_STEP_ORDER } = require('../lib/constants');
const { assertCanAccessApplicant } = require('./permission-service');
const { ensureAdultApplicant } = require('./registration-service');
const { getWorkflowSettings } = require('./settings-service');
const { validateRequiredMaterials, configuredMaterialSchema } = require('./file-service');
const { logAudit } = require('./audit-service');

function statusText(status) {
  return {
    pending: '进行中',
    reviewing: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    locked: '已锁定',
    terminated: '已终止',
  }[status] || status;
}

function statusClass(status) {
  return {
    pending: 'badge-warning',
    reviewing: 'badge-primary',
    approved: 'badge-success',
    rejected: 'badge-danger',
    locked: 'badge-primary',
    terminated: 'badge-danger',
  }[status] || 'badge-primary';
}

function stepOrder(stepCode) {
  const match = /^STEP_(\d+)$/.exec(stepCode || '');
  return match ? Number(match[1]) : null;
}

function isMvpStep(step) {
  return Number(step.sortOrder || stepOrder(step.stepCode) || 0) <= MVP_MAX_STEP_ORDER;
}

function currentRoleIds(user) {
  return (user.roles || []).map((item) => item.id);
}

function primaryRoleLabel(user) {
  return user.roles?.[0]?.label || '系统用户';
}

function configuredFlag(step, key) {
  if (Object.prototype.hasOwnProperty.call(step.taskMeta || {}, key)) {
    return Number(step.taskMeta[key] || 0) === 1;
  }
  return Number(step[key] || 0) === 1;
}

function configuredResponsibleRoles(step) {
  if (step.taskMeta?.responsibleRoles?.length) return step.taskMeta.responsibleRoles;
  if (step.responsibleRoles?.length) return step.responsibleRoles;
  return step.allowedRoles || [];
}

function isApplicantActor(user, applicantId, step) {
  return user.primaryRole === 'applicant' && user.id === applicantId && configuredFlag(step, 'requiresApplicantAction');
}

function isReviewerActor(user, step) {
  if (user.primaryRole === 'applicant') return false;
  const responsibleRoles = configuredResponsibleRoles(step);
  return responsibleRoles.some((roleId) => currentRoleIds(user).includes(roleId)) && configuredFlag(step, 'requiresReviewerAction');
}

function ensureMvpStep(step) {
  if (!isMvpStep(step)) {
    throw errorWithStatus('该流程节点暂未纳入前12步MVP，暂不开放办理', 400);
  }
}

function ensurePreviousStepApproved(workflow, step) {
  const previous = workflow.steps
    .filter((item) => isMvpStep(item) && Number(item.sortOrder || 0) < Number(step.sortOrder || 0))
    .sort((left, right) => Number(right.sortOrder || 0) - Number(left.sortOrder || 0))[0];
  if (previous && previous.status !== 'approved') {
    throw errorWithStatus('上一流程节点未完成，不能办理当前节点', 400);
  }
}

function assertWorkflowActor(user, applicantId, workflow, step, action) {
  if (!step) throw errorWithStatus('未找到对应任务', 404);
  ensureMvpStep(step);
  ensurePreviousStepApproved(workflow, step);
  if (action === 'submit') {
    if (!['pending', 'rejected'].includes(step.status)) throw errorWithStatus('当前节点不能提交', 400);
    if (!isApplicantActor(user, applicantId, step)) throw errorWithStatus('当前账号不能提交该任务', 403);
    return;
  }
  if (action === 'review') {
    if (!['pending', 'reviewing'].includes(step.status)) throw errorWithStatus('当前节点不能审核', 400);
    if (!isReviewerActor(user, step)) throw errorWithStatus('当前账号不能审核该任务', 403);
    return;
  }
  throw errorWithStatus('未知流程动作', 400);
}

function nextTaskStatus(status) {
  if (status === 'approved') return 'done';
  if (status === 'pending') return 'open';
  if (status === 'rejected') return 'blocked';
  if (status === 'terminated') return 'blocked';
  return 'in_review';
}

async function getWorkflowByApplicantId(applicantId) {
  const instance = await first(
    `SELECT id, applicant_id AS applicantId, current_stage AS currentStage, updated_at AS updatedAt
     FROM workflow_instances
     WHERE applicant_id = :applicantId`,
    { applicantId },
  );
  if (!instance) {
    throw errorWithStatus('未找到对应流程', 404);
  }
  const steps = await query(
    `SELECT
        r.id,
        r.step_code AS stepCode,
        d.sort_order AS sortOrder,
        d.name,
        d.phase,
        d.allowed_roles_json AS allowedRolesJson,
        d.form_schema_json AS formSchemaJson,
        d.actor_type AS actorType,
        d.responsible_roles_json AS responsibleRolesJson,
        d.requires_applicant_action AS requiresApplicantAction,
        d.requires_reviewer_action AS requiresReviewerAction,
        d.notification_template AS notificationTemplate,
        d.material_schema_json AS materialSchemaJson,
        d.time_rule_json AS timeRuleJson,
        d.start_at AS startAt,
        d.end_at AS endAt,
        r.status,
        r.form_data_json AS formDataJson,
        r.review_comment AS reviewComment,
        r.last_operator_id AS lastOperatorId,
        lu.name AS lastOperatorName,
        r.operated_at AS operatedAt,
        r.deadline,
        r.task_status AS taskStatus,
        r.confirmed_at AS confirmedAt,
        r.reschedule_count AS rescheduleCount,
        r.reschedule_history_json AS rescheduleHistoryJson,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', a.id,
              'fileName', a.file_name,
              'fileUrl', a.file_url,
              'mimeType', a.mime_type,
              'materialTag', a.material_tag
            )
          )
          FROM attachments a
          WHERE a.step_record_id = r.id
        ) AS attachmentsJson
     FROM workflow_step_records r
     INNER JOIN workflow_step_definitions d ON d.step_code = r.step_code
     LEFT JOIN users lu ON lu.id = r.last_operator_id
     WHERE r.instance_id = :instanceId
     ORDER BY d.sort_order ASC`,
    { instanceId: instance.id },
  );
  return {
    instance,
    steps: steps.map((item) => ({
      ...item,
      allowedRoles: parseJson(item.allowedRolesJson, []),
      formSchema: parseJson(item.formSchemaJson, {}),
      responsibleRoles: parseJson(item.responsibleRolesJson, []),
      materialSchema: parseJson(item.materialSchemaJson, []),
      timeRule: parseJson(item.timeRuleJson, {}),
      formData: parseJson(item.formDataJson, {}),
      attachments: parseJson(item.attachmentsJson, []),
      rescheduleHistory: parseJson(item.rescheduleHistoryJson, []),
      taskMeta: getStepDetail(item.stepCode, parseJson(item.responsibleRolesJson || item.allowedRolesJson, [])),
      statusText: statusText(item.status),
      statusClassName: statusClass(item.status),
    })),
  };
}

async function advanceAfterReview(workflow, step, nextStatus, formData = {}) {
  const applicantId = workflow.instance?.applicantId;
  if (nextStatus === 'approved') {
    const nextStage = {
      STEP_03: '入党积极分子',
      STEP_07: '发展对象',
    }[step.stepCode];
    if (nextStage && applicantId) {
      await query(
        `UPDATE applicant_profiles
         SET current_stage = :currentStage, updated_at = :updatedAt
         WHERE user_id = :applicantId`,
        { currentStage: nextStage, updatedAt: now(), applicantId },
      );
      await query(
        `UPDATE workflow_instances
         SET current_stage = :currentStage, updated_at = :updatedAt
         WHERE applicant_id = :applicantId`,
        { currentStage: nextStage, updatedAt: now(), applicantId },
      );
    }
    const nextStep = workflow.steps
      .filter((item) => isMvpStep(item) && Number(item.sortOrder || 0) > Number(step.sortOrder || 0))
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))[0];
    if (nextStep && nextStep.status === 'locked') {
      await query(
        `UPDATE workflow_step_records
         SET status = 'pending', task_status = 'open'
         WHERE id = :id`,
        { id: nextStep.id },
      );
    }
    return;
  }
  if (['pending', 'rejected', 'terminated'].includes(nextStatus)) {
    const laterSteps = workflow.steps.filter((item) => isMvpStep(item) && Number(item.sortOrder || 0) > Number(step.sortOrder || 0) && item.status !== 'approved');
    for (const item of laterSteps) {
      await query(
        `UPDATE workflow_step_records
         SET status = 'locked', task_status = 'waiting'
         WHERE id = :id`,
        { id: item.id },
      );
    }
    const shouldMarkStopped = nextStatus === 'terminated' || formData?.businessFields?.activistDecision === '暂不确定';
    if (shouldMarkStopped && applicantId) {
      await query(
        `UPDATE workflow_instances
         SET current_stage = :currentStage, updated_at = :updatedAt
         WHERE applicant_id = :applicantId`,
        { currentStage: '暂缓发展', updatedAt: now(), applicantId },
      );
    }
  }
}

function resolveReviewOutcome(step, requestedStatus, formData = {}) {
  if (requestedStatus !== 'approved') return requestedStatus;
  const fields = formData.businessFields || {};
  if (step.stepCode === 'STEP_03' && fields.activistDecision === '暂不确定') return 'pending';
  if (step.stepCode === 'STEP_09' && fields.politicalReviewResult === '不合格') return 'pending';
  if (step.stepCode === 'STEP_11' && String(fields.branchReviewResult || '').startsWith('不合格')) return 'pending';
  if (step.stepCode === 'STEP_12' && fields.committeePreReviewResult === '不同意发展') return 'pending';
  return requestedStatus;
}

async function assertWorkflowTimeWindow(step) {
  const settings = await getWorkflowSettings();
  if (!settings.enforceTimeLimit) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (step.startAt) {
    const start = new Date(step.startAt);
    start.setHours(0, 0, 0, 0);
    if (!Number.isNaN(start.getTime()) && today < start) {
      throw errorWithStatus('当前节点尚未到开始时间', 400);
    }
  }
  const endValue = step.endAt || step.deadline;
  if (endValue) {
    const end = new Date(endValue);
    end.setHours(0, 0, 0, 0);
    if (!Number.isNaN(end.getTime()) && today > end) {
      throw errorWithStatus('当前节点已超过截止时间', 400);
    }
  }
}

function mergeWorkflowFormData(step, incomingFormData = {}) {
  return {
    ...(step.formData || {}),
    ...incomingFormData,
    businessFields: {
      ...(step.formData?.businessFields || {}),
      ...(incomingFormData.businessFields || {}),
    },
  };
}

function fieldsForWorkflowAction(step, action) {
  const fields = step.taskMeta?.businessFields || step.formSchema?.businessFields || [];
  if (action === 'submit') {
    return fields.filter((item) => !item.owner || item.owner === 'applicant' || item.owner === 'both');
  }
  if (action === 'review') {
    return fields.filter((item) => !item.owner || item.owner === 'reviewer' || item.owner === 'both');
  }
  return [];
}

function validateRequiredBusinessFields(step, formData, action) {
  const businessFields = formData.businessFields || {};
  const missing = fieldsForWorkflowAction(step, action).find((field) => (
    field.required && !String(businessFields[field.key] || formData[field.key] || '').trim()
  ));
  if (missing) {
    throw errorWithStatus(`请填写${missing.label}`, 400);
  }
}

async function notifyWorkflowSubmission(user, applicantId, step) {
  const { notificationRecipientsForStep, createNotification } = require('./notification-service');
  const recipients = await notificationRecipientsForStep(step, applicantId, [user.id]);
  for (const userId of recipients) {
    await createNotification(
      userId,
      'task_submitted',
      `${step.name}待处理`,
      `${user.name}已提交“${step.name}”，请按流程要求及时处理。`,
      step.stepCode,
      'workflow',
      applicantId,
    );
  }
}

async function notifyWorkflowReview(user, applicantId, workflow, step, nextStatus) {
  const { notificationRecipientsForStep, createNotification } = require('./notification-service');
  await createNotification(
    applicantId,
    'task_reviewed',
    `${step.name}${nextStatus === 'approved' ? '已通过' : '需补充'}`,
    nextStatus === 'approved' ? `“${step.name}”已审核通过，请关注下一步通知。` : `“${step.name}”已退回，请根据意见补充材料。`,
    step.stepCode,
    'workflow',
    applicantId,
  );
  if (nextStatus !== 'approved') return;
  const nextStep = workflow.steps
    .filter((item) => isMvpStep(item) && Number(item.sortOrder || 0) > Number(step.sortOrder || 0))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))[0];
  if (!nextStep) return;
  const recipients = await notificationRecipientsForStep(nextStep, applicantId, [user.id, applicantId]);
  for (const userId of recipients) {
    await createNotification(
      userId,
      'next_step_opened',
      `${nextStep.name}已开放`,
      `上一节点“${step.name}”已通过，请按要求办理“${nextStep.name}”。`,
      nextStep.stepCode,
      'workflow',
      applicantId,
    );
  }
}

async function submitWorkflowTask(user, applicantId, stepCode, payload = {}, auditAction = 'submit_step') {
  await assertCanAccessApplicant(user, applicantId);
  const workflow = await getWorkflowByApplicantId(applicantId);
  const step = workflow.steps.find((item) => item.stepCode === stepCode);
  assertWorkflowActor(user, applicantId, workflow, step, 'submit');
  await assertWorkflowTimeWindow(step);
  if (step.stepCode === 'STEP_01') {
    await ensureAdultApplicant(applicantId);
  }
  const incomingFormData = payload.formData || payload || {};
  const mergedFormData = mergeWorkflowFormData(step, incomingFormData);
  validateRequiredBusinessFields(step, mergedFormData, 'submit');
  await validateRequiredMaterials(step);
  await query(
    `UPDATE workflow_step_records
     SET status = 'reviewing',
         task_status = 'in_review',
         form_data_json = :formDataJson,
         review_comment = :reviewComment,
         last_operator_id = :operatorId,
         operated_at = :operatedAt
     WHERE id = :id`,
    {
      formDataJson: JSON.stringify(mergedFormData),
      reviewComment: payload.reviewComment || '',
      operatorId: user.id,
      operatedAt: now(),
      id: step.id,
    },
  );
  await logAudit('workflow_step_records', step.id, auditAction, user.id, payload || {});
  await notifyWorkflowSubmission(user, applicantId, step);
  return { applicantId, stepCode: step.stepCode, status: 'reviewing' };
}

async function reviewWorkflowTask(user, applicantId, stepCode, payload = {}, auditAction = 'review_step') {
  await assertCanAccessApplicant(user, applicantId);
  const workflow = await getWorkflowByApplicantId(applicantId);
  const step = workflow.steps.find((item) => item.stepCode === stepCode);
  assertWorkflowActor(user, applicantId, workflow, step, 'review');
  await assertWorkflowTimeWindow(step);
  const requestedStatus = payload.status || 'approved';
  if (!ALLOWED_REVIEW_STATUSES.has(requestedStatus)) {
    throw errorWithStatus('审核状态不合法', 400);
  }
  const incomingFormData = payload.formData || {};
  const mergedFormData = mergeWorkflowFormData(step, incomingFormData);
  if (requestedStatus === 'approved') {
    validateRequiredBusinessFields(step, mergedFormData, 'review');
    await validateRequiredMaterials(step);
  }
  const nextStatus = resolveReviewOutcome(step, requestedStatus, mergedFormData);
  await query(
    `UPDATE workflow_step_records
     SET status = :status,
         task_status = :taskStatus,
         form_data_json = :formDataJson,
         review_comment = :reviewComment,
         last_operator_id = :operatorId,
         operated_at = :operatedAt,
         confirmed_at = :confirmedAt
     WHERE id = :id`,
    {
      status: nextStatus,
      taskStatus: nextTaskStatus(nextStatus),
      formDataJson: JSON.stringify(mergedFormData),
      reviewComment: payload.comment || '',
      operatorId: user.id,
      operatedAt: now(),
      confirmedAt: nextStatus === 'approved' ? now() : null,
      id: step.id,
    },
  );
  await advanceAfterReview(workflow, step, nextStatus, mergedFormData);
  await logAudit('workflow_step_records', step.id, auditAction, user.id, payload || {});
  await notifyWorkflowReview(user, applicantId, workflow, step, nextStatus);
  return { applicantId, stepCode: step.stepCode, status: nextStatus };
}

module.exports = {
  statusText,
  statusClass,
  stepOrder,
  isMvpStep,
  currentRoleIds,
  primaryRoleLabel,
  configuredFlag,
  configuredResponsibleRoles,
  configuredMaterialSchema,
  isApplicantActor,
  isReviewerActor,
  ensureMvpStep,
  ensurePreviousStepApproved,
  assertWorkflowActor,
  nextTaskStatus,
  getWorkflowByApplicantId,
  advanceAfterReview,
  resolveReviewOutcome,
  assertWorkflowTimeWindow,
  mergeWorkflowFormData,
  fieldsForWorkflowAction,
  validateRequiredBusinessFields,
  submitWorkflowTask,
  reviewWorkflowTask,
};
