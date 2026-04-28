const { first } = require('../db');
const { scopeClause, hasPermission, roleScopeLabel } = require('./permission-service');
const { getApplicants, listRegistrationRequests } = require('./applicant-service');
const { getApplicantProfileByUserId } = require('./profile-service');
const {
  getWorkflowByApplicantId,
  isMvpStep,
  isApplicantActor,
  isReviewerActor,
  stepOrder,
  primaryRoleLabel,
} = require('./workflow-service');
const { listNotifications } = require('./notification-service');
const { recentAuditLogs } = require('./audit-service');

async function dashboardForUser(user) {
  if (user.primaryRole === 'applicant') {
    return {
      welcome: `${user.roles[0]?.label || '用户'} · ${user.name}`,
      scopeLabel: roleScopeLabel(user),
      currentStage: user.roles[0]?.label || '系统用户',
      metrics: [],
      stageDistribution: [],
    };
  }
  const applicants = await getApplicants(user, {});
  const pendingRegistrations = hasPermission(user, 'approve_registration')
    ? await listRegistrationRequests(user, { status: 'pending' })
    : [];
  const scope = scopeClause(user, 'u');
  const pendingReviews = await first(
    `SELECT COUNT(*) AS count
     FROM workflow_step_records r
     INNER JOIN workflow_instances i ON i.id = r.instance_id
     INNER JOIN users u ON u.id = i.applicant_id
     WHERE r.status = 'reviewing' ${scope.sql}`,
    scope.params,
  );
  const stageMap = {};
  applicants.forEach((item) => {
    stageMap[item.currentStage] = (stageMap[item.currentStage] || 0) + 1;
  });
  return {
    welcome: `${user.roles[0]?.label || '用户'} · ${user.name}`,
    scopeLabel: roleScopeLabel(user),
    currentStage: user.roles[0]?.label || '系统用户',
    metrics: [
      { label: '申请人数', value: applicants.length, desc: '当前权限范围内台账人数', route: '/applicants' },
      { label: '待注册审核', value: pendingRegistrations.length, desc: '首次注册待审核', route: '/reviews?tab=registration' },
      { label: '待流程审核', value: pendingReviews?.count || 0, desc: '待审批节点数量', route: '/reviews?tab=workflow' },
      { label: '查看范围', value: user.orgName || '全校', desc: user.branchName || '系统级数据范围', route: '/profile' },
    ],
    stageDistribution: Object.entries(stageMap).map(([stage, count]) => ({ stage, count })),
  };
}

function mobileTaskStatus(step) {
  if (step.taskStatus) return step.taskStatus;
  if (step.status === 'approved') return 'done';
  if (step.status === 'reviewing') return 'in_review';
  if (step.status === 'rejected' || step.status === 'terminated') return 'blocked';
  if (step.status === 'locked') return 'waiting';
  return 'open';
}

function mobileReviewState(step) {
  if (step.status === 'approved') {
    return { code: 'approved', icon: 'passed', label: '已通过', className: 'is-approved' };
  }
  if (step.status === 'rejected' || step.status === 'terminated') {
    return { code: 'rejected', icon: 'close', label: '未通过', className: 'is-rejected' };
  }
  if (step.status === 'locked') {
    return { code: 'not-started', icon: 'stop-circle-o', label: '未开放', className: 'is-not-started' };
  }
  return { code: 'pending', icon: 'clock-o', label: step.statusText || '待处理', className: 'is-pending' };
}

function daysUntil(value) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function remainingLabel(days) {
  if (days === null || days === undefined) return '未设时限';
  if (days < 0) return `已超期${Math.abs(days)}天`;
  if (days === 0) return '今日截止';
  return `剩余${days}天`;
}

function isWithinTodoWindow(step) {
  const remainingDays = daysUntil(step.endAt || step.deadline || null);
  return remainingDays === null || remainingDays >= 0;
}

function buildTodoItem(user, applicant, workflow, step) {
  const taskOwner = isApplicantActor(user, applicant.userId || applicant.id, step) ? '申请人' : '审核者';
  const materialSchema = step.taskMeta?.materialSchema?.length ? step.taskMeta.materialSchema : (step.materialSchema || []);
  const uploadRequired = materialSchema.length > 0;
  const canSubmit = isApplicantActor(user, applicant.userId || applicant.id, step) && ['pending', 'rejected'].includes(step.status);
  const canReview = isReviewerActor(user, step) && ['pending', 'reviewing'].includes(step.status);
  const actionKind = canReview ? 'review' : (canSubmit ? (uploadRequired ? 'upload' : 'submit') : 'notice');
  const isCompleted = step.status === 'approved';
  const reviewState = mobileReviewState(step);
  const dueAt = step.endAt || step.deadline || null;
  const remainingDays = daysUntil(dueAt);
  return {
    workflowId: applicant.userId || applicant.id,
    taskId: step.stepCode,
    applicantId: applicant.userId || applicant.id,
    applicantName: applicant.name,
    stepCode: step.stepCode,
    sortOrder: step.sortOrder || stepOrder(step.stepCode),
    orderLabel: `${step.sortOrder || stepOrder(step.stepCode) || ''}. `,
    stepName: step.name,
    phase: step.phase,
    status: step.status,
    statusText: step.statusText,
    reviewState,
    reviewIcon: reviewState.icon,
    reviewLabel: reviewState.label,
    reviewClassName: reviewState.className,
    taskStatus: mobileTaskStatus(step),
    actorType: step.actorType || step.taskMeta?.actorType || 'reviewer',
    taskOwner,
    summary: step.taskMeta?.taskSummary || '请按要求完成当前节点办理。',
    cardTitle: step.name,
    cardSubtitle: `${step.phase} · ${taskOwner}`,
    cardType: actionKind,
    cardClass: isCompleted ? 'is-done' : `is-${actionKind}`,
    detailRoute: `/workflow/${applicant.userId || applicant.id}/steps/${step.stepCode}`,
    blessingText: isCompleted ? `${step.name}已完成，请继续关注后续流程通知。` : '',
    requiresApplicantAction: Number(step.taskMeta?.requiresApplicantAction ?? step.requiresApplicantAction ?? 0) === 1,
    requiresReviewerAction: Number(step.taskMeta?.requiresReviewerAction ?? step.requiresReviewerAction ?? 0) === 1,
    canSubmit,
    canReview,
    canReschedule: step.stepCode === 'STEP_02' && (isApplicantActor(user, applicant.userId || applicant.id, step) || isReviewerActor(user, step)),
    uploadRequired,
    materialSchema,
    businessFields: step.taskMeta?.businessFields || step.formSchema?.businessFields || [],
    timeRule: step.taskMeta?.timeRule || step.timeRule || {},
    attachments: step.attachments || [],
    formData: step.formData || {},
    rescheduleHistory: step.rescheduleHistory || [],
    startAt: step.startAt,
    endAt: step.endAt,
    deadline: step.deadline,
    dueAt,
    remainingDays,
    remainingLabel: remainingLabel(remainingDays),
    isOverdue: remainingDays !== null && remainingDays < 0 && !['approved', 'locked'].includes(step.status),
    operatedAt: step.operatedAt,
    confirmedAt: step.confirmedAt,
    reviewComment: step.reviewComment,
    currentStage: workflow.instance?.currentStage || applicant.currentStage || '',
  };
}

async function listMobileTodos(user) {
  const applicants = user.primaryRole === 'applicant'
    ? [{ ...(await getApplicantProfileByUserId(user.id)), id: user.id, userId: user.id }]
    : await getApplicants(user, {});

  const todos = [];
  for (const applicant of applicants.filter(Boolean)) {
    const workflow = await getWorkflowByApplicantId(applicant.userId || applicant.id);
    const mvpSteps = workflow.steps.filter(isMvpStep);
    const currentStep = mvpSteps.find((item) => ['pending', 'reviewing', 'rejected'].includes(item.status));
    for (const step of mvpSteps) {
      const visibleToApplicant = isApplicantActor(user, applicant.userId || applicant.id, step) && ['pending', 'rejected'].includes(step.status);
      const visibleToReviewer = isReviewerActor(user, step) && ['reviewing', 'pending'].includes(step.status);
      const isApplicantOwner = user.primaryRole === 'applicant' && user.id === (applicant.userId || applicant.id);
      const visibleCurrentNode = isApplicantOwner && step.id === currentStep?.id && ['pending', 'reviewing'].includes(step.status) && isWithinTodoWindow(step);
      const visibleFailedNode = isApplicantOwner && step.status === 'rejected';
      if (!visibleToApplicant && !visibleToReviewer && !visibleCurrentNode && !visibleFailedNode) continue;
      todos.push(buildTodoItem(user, applicant, workflow, step));
    }
  }
  return todos.sort((left, right) => {
    const leftValue = left.operatedAt || '9999-12-31 23:59:59';
    const rightValue = right.operatedAt || '9999-12-31 23:59:59';
    return leftValue.localeCompare(rightValue);
  });
}

async function buildMobileWorkflow(user, applicantId) {
  const { canAccessApplicant } = require('./applicant-service');
  const { errorWithStatus } = require('../lib/utils');
  if (!(await canAccessApplicant(user, applicantId))) {
    throw errorWithStatus('无权查看该流程', 403);
  }
  const applicant = await getApplicantProfileByUserId(applicantId);
  const workflow = await getWorkflowByApplicantId(applicantId);
  const mvpSteps = workflow.steps.filter(isMvpStep);
  const currentStep = mvpSteps.find((item) => ['pending', 'reviewing', 'rejected'].includes(item.status)) || mvpSteps[0];
  const completedSteps = mvpSteps.filter((item) => item.status === 'approved');
  const todoSteps = workflow.steps
    .filter((item) => isMvpStep(item) && ['pending', 'reviewing', 'rejected'].includes(item.status))
    .map((item) => buildTodoItem(user, { ...applicant, userId: applicantId }, workflow, item));
  return {
    applicant: {
      userId: applicantId,
      name: applicant?.name || user.name,
      username: applicant?.username || user.username,
      orgName: applicant?.orgName || user.orgName,
      branchName: applicant?.branchName || user.branchName,
      currentStage: applicant?.currentStage || workflow.instance?.currentStage || '',
      phone: applicant?.phone || '',
    },
    workflowId: applicantId,
    currentStage: workflow.instance?.currentStage || '',
    currentStep: currentStep ? buildTodoItem(user, { ...applicant, userId: applicantId }, workflow, currentStep) : null,
    completedSteps: completedSteps.map((item) => buildTodoItem(user, { ...applicant, userId: applicantId }, workflow, item)),
    steps: mvpSteps.map((item) => buildTodoItem(user, { ...applicant, userId: applicantId }, workflow, item)),
    todos: todoSteps,
  };
}

async function buildMobileWorkbench(user) {
  const dashboard = await dashboardForUser(user);
  const todos = await listMobileTodos(user);
  const messages = await listNotifications(user, 5);
  const logs = await recentAuditLogs(user, 5);
  const workflowId = user.primaryRole === 'applicant' ? user.id : (todos[0]?.workflowId || null);
  const workflow = workflowId ? await buildMobileWorkflow(user, workflowId) : null;
  return {
    currentUser: {
      userId: user.id,
      name: user.name,
      username: user.username,
      primaryRole: user.primaryRole,
      roleLabel: primaryRoleLabel(user),
      orgName: user.orgName || '',
      branchName: user.branchName || '',
      scopeLabel: roleScopeLabel(user),
    },
    metrics: dashboard.metrics,
    nextTask: todos[0] || null,
    process: workflow
      ? {
          currentStage: workflow.currentStage,
          currentStep: workflow.currentStep,
          completedCount: workflow.completedSteps.length,
          totalCount: workflow.steps.length,
        }
      : null,
    todos: todos.slice(0, 6),
    messages,
    recentLogs: logs,
  };
}

function resolveMobileWorkflowId(user, workflowId) {
  return workflowId === 'me' ? user.id : workflowId;
}

module.exports = {
  dashboardForUser,
  mobileTaskStatus,
  mobileReviewState,
  daysUntil,
  remainingLabel,
  buildTodoItem,
  listMobileTodos,
  buildMobileWorkflow,
  buildMobileWorkbench,
  resolveMobileWorkflowId,
};
