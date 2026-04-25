const path = require('node:path');
const XLSX = require('xlsx');
const jwt = require('jsonwebtoken');
const { env } = require('./env');
const { query, first, getPool } = require('./db');
const { getStepDetail } = require('./workflow-config');
const { hashPassword, verifyPassword, needsPasswordRehash } = require('./password');

const MVP_MAX_STEP_ORDER = 12;
const HIGH_PRIVILEGE_ROLES = new Set(['superAdmin', 'orgDept']);
const ALLOWED_REVIEW_STATUSES = new Set(['approved', 'rejected']);
const FILE_ACCEPT_RULES = {
  pdf: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
  },
  image: {
    extensions: ['.jpg', '.jpeg', '.png'],
    mimeTypes: ['image/jpeg', 'image/png'],
  },
};

/**
 * Shared request context for the HTTP layer.
 *
 * Keep cross-route security rules, data-scope checks, workflow transitions and
 * serialization helpers here so route modules stay thin and consistent.
 */

// Small HTTP and serialization helpers shared by every route group.
function ok(res, data, message = 'ok') {
  res.json({ code: 0, message, data });
}

function fail(res, status, message, code = status) {
  res.status(status).json({ code, message, data: null });
}

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username, role: user.primaryRole }, env.JWT_SECRET, { expiresIn: '7d' });
}

function buildMenus(permissions) {
  const menuMap = {
    view_dashboard: 'dashboard',
    view_applicants: 'applicants',
    view_workflows: 'workflowDetail',
    review_steps: 'reviews',
    manage_orgs: 'organizations',
    view_org_stats: 'analytics',
    view_branch_stats: 'analytics',
    export_branch: 'exports',
    export_org: 'exports',
    export_all: 'exports',
    configure_workflow: 'workflowConfig',
  };
  return Array.from(new Set(permissions.map((item) => menuMap[item.id]).filter(Boolean)));
}

function roleScopeLabel(user) {
  if (user.primaryRole === 'applicant') return '本人数据';
  if (user.primaryRole === 'branchSecretary') return '本支部数据';
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) return '本单位数据';
  return '全校数据';
}

// 当前仍按申请人、基层管理、管理员三类资料视图区分，不要回退成一套混合表单。
function profileTypeForRole(role) {
  if (role === 'applicant') return 'applicant';
  if (['branchSecretary', 'organizer'].includes(role)) return 'cadre';
  return 'admin';
}

// 这里只生成资料视图默认值，不在这里写死后续可能变化的完整业务字段。
function buildDefaultProfilePayload(user) {
  if (user.primaryRole === 'applicant') {
    return {
      name: user.name,
      username: user.username,
      currentStage: '入党申请人',
      phone: '',
      education: '',
      degree: '',
      unitName: user.orgName || '',
      occupation: '',
      specialty: '',
      resume: '',
      familyInfo: '',
      awards: '',
    };
  }
  if (['branchSecretary', 'organizer'].includes(user.primaryRole)) {
    return {
      name: user.name,
      username: user.username,
      roleLabel: user.roles[0]?.label || '管理角色',
      orgName: user.orgName || '',
      branchName: user.branchName || '',
      phone: '',
      dutySummary: '',
      workFocus: '',
    };
  }
  return {
    name: user.name,
    username: user.username,
    roleLabel: user.roles[0]?.label || '系统角色',
    scopeLabel: roleScopeLabel(user),
    phone: '',
    managementScope: '',
    systemNote: '',
  };
}

async function logAudit(targetType, targetId, action, operatorId, detail = {}) {
  await query(
    `INSERT INTO audit_logs (target_type, target_id, action, operator_id, detail_json, created_at)
     VALUES (:targetType, :targetId, :action, :operatorId, :detailJson, :createdAt)`,
    {
      targetType,
      targetId: String(targetId),
      action,
      operatorId,
      detailJson: JSON.stringify(detail),
      createdAt: now(),
    },
  );
}

// Authentication payload assembly is centralized so all clients receive the
// same role, permission and menu shape after login or token refresh.
async function getUserWithAuth(userId) {
  const user = await first(
    `SELECT
        u.id,
        u.username,
        u.name,
        u.status,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        o.name AS orgName,
        b.name AS branchName
     FROM users u
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = :userId`,
    { userId },
  );
  if (!user) return null;
  const roles = await query(
    `SELECT r.id, r.label, r.scope_level AS scopeLevel
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :userId
     ORDER BY ur.id ASC`,
    { userId },
  );
  const permissions = await query(
    `SELECT DISTINCT p.id, p.label
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     INNER JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = :userId
     ORDER BY p.id ASC`,
    { userId },
  );
  return {
    ...user,
    roles,
    permissions,
    primaryRole: roles[0]?.id || 'applicant',
    menus: buildMenus(permissions),
  };
}

// 统一认证中间件，后续如果调整为服务号网页登录票据，也应优先从这里扩展。
function requireAuth() {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) return fail(res, 401, '未登录');
      const decoded = jwt.verify(token, env.JWT_SECRET);
      const user = await getUserWithAuth(decoded.uid);
      if (!user) return fail(res, 401, '用户不存在');
      req.user = user;
      return next();
    } catch (error) {
      return fail(res, 401, '登录状态已失效');
    }
  };
}

function hasPermission(user, permissionId) {
  return (user.permissions || []).some((item) => item.id === permissionId);
}

function requirePermission(permissionId) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permissionId)) return fail(res, 403, '无权执行该操作');
    return next();
  };
}

// 数据范围约束集中维护在这里，避免每个查询接口手写一套权限过滤。
function scopeClause(user, applicantAlias = 'u') {
  if (user.primaryRole === 'applicant') {
    return { sql: ` AND ${applicantAlias}.id = :scopeUserId`, params: { scopeUserId: user.id } };
  }
  if (user.primaryRole === 'branchSecretary') {
    return { sql: ` AND ${applicantAlias}.branch_id = :scopeBranchId`, params: { scopeBranchId: user.branchId } };
  }
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) {
    return { sql: ` AND ${applicantAlias}.org_id = :scopeOrgId`, params: { scopeOrgId: user.orgId } };
  }
  return { sql: '', params: {} };
}

async function getApplicants(user, filters = {}) {
  const scope = scopeClause(user, 'u');
  return query(
    `SELECT
        u.id,
        u.username,
        u.name,
        u.status,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        o.name AS orgName,
        b.name AS branchName,
        ap.current_stage AS currentStage,
        ap.phone,
        ap.unit_name AS unitName,
        ap.occupation
     FROM applicant_profiles ap
     INNER JOIN users u ON u.id = ap.user_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE 1 = 1
       ${scope.sql}
       ${filters.orgId ? ' AND u.org_id = :orgId' : ''}
       ${filters.branchId ? ' AND u.branch_id = :branchId' : ''}
       ${filters.stage ? ' AND ap.current_stage = :stage' : ''}
       ${filters.keyword ? ' AND (u.name LIKE :keyword OR u.username LIKE :keyword OR ap.unit_name LIKE :keyword)' : ''}
     ORDER BY u.username ASC`,
    {
      ...scope.params,
      orgId: filters.orgId,
      branchId: filters.branchId,
      stage: filters.stage,
      keyword: filters.keyword ? `%${filters.keyword}%` : undefined,
    },
  );
}

async function canAccessApplicant(user, applicantId) {
  const rows = await getApplicants(user, {});
  return rows.some((item) => item.id === applicantId);
}

function errorWithStatus(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function stepOrder(stepCode) {
  const match = /^STEP_(\d+)$/.exec(stepCode || '');
  return match ? Number(match[1]) : null;
}

function isMvpStep(step) {
  return Number(step.sortOrder || stepOrder(step.stepCode) || 0) <= MVP_MAX_STEP_ORDER;
}

function canAccessScopedRecord(user, record) {
  if (user.primaryRole === 'applicant') return user.id === record.id || user.id === record.userId;
  if (user.primaryRole === 'branchSecretary') return Boolean(user.branchId && user.branchId === record.branchId);
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) return Boolean(user.orgId && user.orgId === record.orgId);
  return true;
}

async function assertCanAccessApplicant(user, applicantId) {
  if (!(await canAccessApplicant(user, applicantId))) {
    throw errorWithStatus('无权访问该申请人', 403);
  }
}

async function getApplicantProfileByUserId(userId) {
  return first(
    `SELECT
        ap.user_id AS userId,
        u.username,
        u.name,
        o.name AS orgName,
        b.name AS branchName,
        ap.current_stage AS currentStage,
        ap.phone,
        ap.education,
        ap.degree,
        ap.unit_name AS unitName,
        ap.occupation,
        ap.profile_json AS profileJson
     FROM applicant_profiles ap
     INNER JOIN users u ON u.id = ap.user_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE ap.user_id = :userId`,
    { userId },
  );
}

async function getUserProfileRecord(userId) {
  return first(
    `SELECT
        user_id AS userId,
        profile_type AS profileType,
        profile_json AS profileJson,
        updated_at AS updatedAt
     FROM user_profiles
     WHERE user_id = :userId`,
    { userId },
  );
}

// Profile views are role-aware: applicant, cadre and admin users intentionally
// receive different editable fields while sharing the same endpoint contract.
async function getProfileViewByUser(user) {
  const profileRecord = await getUserProfileRecord(user.id);
  const baseProfile = buildDefaultProfilePayload(user);
  if (user.primaryRole === 'applicant') {
    const applicantProfile = await getApplicantProfileByUserId(user.id);
    return {
      ...baseProfile,
      ...parseJson(profileRecord?.profileJson, {}),
      ...parseJson(applicantProfile?.profileJson, {}),
      userId: user.id,
      username: user.username,
      name: user.name,
      orgName: user.orgName,
      branchName: user.branchName,
      currentStage: applicantProfile?.currentStage || baseProfile.currentStage,
      phone: applicantProfile?.phone || '',
      education: applicantProfile?.education || '',
      degree: applicantProfile?.degree || '',
      unitName: applicantProfile?.unitName || user.orgName || '',
      occupation: applicantProfile?.occupation || '',
      roleLabel: user.roles[0]?.label || '入党申请人',
      scopeLabel: roleScopeLabel(user),
      profileType: profileRecord?.profileType || 'applicant',
    };
  }
  return {
    ...baseProfile,
    ...parseJson(profileRecord?.profileJson, {}),
    userId: user.id,
    username: user.username,
    name: user.name,
    orgName: user.orgName,
    branchName: user.branchName,
    roleLabel: user.roles[0]?.label || '系统用户',
    scopeLabel: roleScopeLabel(user),
    profileType: profileRecord?.profileType || profileTypeForRole(user.primaryRole),
  };
}

async function upsertUserProfile(user, payload) {
  const profileType = profileTypeForRole(user.primaryRole);
  await query(
    `INSERT INTO user_profiles (user_id, profile_type, profile_json, updated_at)
     VALUES (:userId, :profileType, :profileJson, :updatedAt)
     ON DUPLICATE KEY UPDATE
       profile_type = VALUES(profile_type),
       profile_json = VALUES(profile_json),
       updated_at = VALUES(updated_at)`,
    {
      userId: user.id,
      profileType,
      profileJson: JSON.stringify(payload),
      updatedAt: now(),
    },
  );
}

async function getWechatBindingByUserId(userId) {
  return first(
    `SELECT
        id,
        user_id AS userId,
        openid,
        unionid,
        nickname,
        avatar_url AS avatarUrl,
        status,
        bound_at AS boundAt,
        last_login_at AS lastLoginAt
     FROM wechat_bindings
     WHERE user_id = :userId AND status = 'active'`,
    { userId },
  );
}

function statusText(status) {
  return {
    pending: '待填写',
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

async function getWorkflowByApplicantId(applicantId) {
  const instance = await first(
    `SELECT id, applicant_id AS applicantId, current_stage AS currentStage, updated_at AS updatedAt
     FROM workflow_instances
     WHERE applicant_id = :applicantId`,
    { applicantId },
  );
  if (!instance) {
    const error = new Error('未找到对应流程');
    error.status = 404;
    throw error;
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

async function dashboardForUser(user) {
  const applicants = await getApplicants(user, {});
  const pendingRegistrations = await first('SELECT COUNT(*) AS count FROM registration_requests WHERE status = :status', { status: 'pending' });
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
      { label: '申请人数', value: applicants.length, desc: '当前权限范围内台账人数' },
      { label: '待注册审核', value: pendingRegistrations?.count || 0, desc: '首次注册待审核' },
      { label: '待流程审核', value: pendingReviews?.count || 0, desc: '待审批节点数量' },
      { label: '查看范围', value: user.orgName || '全校', desc: user.branchName || '系统级数据范围' },
    ],
    stageDistribution: Object.entries(stageMap).map(([stage, count]) => ({ stage, count })),
  };
}

// Workflow actor checks protect both PC and H5 endpoints. Keep all future step
// state rules here instead of duplicating them in route handlers.
function currentRoleIds(user) {
  return (user.roles || []).map((item) => item.id);
}

function primaryRoleLabel(user) {
  return user.roles?.[0]?.label || '系统用户';
}

function isApplicantActor(user, applicantId, step) {
  return user.primaryRole === 'applicant' && user.id === applicantId && Number(step.requiresApplicantAction || step.taskMeta?.requiresApplicantAction || 0) === 1;
}

function isReviewerActor(user, step) {
  if (user.primaryRole === 'applicant') return false;
  const responsibleRoles = step.responsibleRoles?.length ? step.responsibleRoles : step.taskMeta?.responsibleRoles || step.allowedRoles || [];
  return responsibleRoles.some((roleId) => currentRoleIds(user).includes(roleId)) && Number(step.requiresReviewerAction || step.taskMeta?.requiresReviewerAction || 0) === 1;
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
  if (status === 'rejected') return 'blocked';
  return 'in_review';
}

async function advanceAfterReview(workflow, step, nextStatus) {
  if (nextStatus === 'approved') {
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
  if (nextStatus === 'rejected') {
    const laterSteps = workflow.steps.filter((item) => isMvpStep(item) && Number(item.sortOrder || 0) > Number(step.sortOrder || 0) && item.status !== 'approved');
    for (const item of laterSteps) {
      await query(
        `UPDATE workflow_step_records
         SET status = 'locked', task_status = 'waiting'
         WHERE id = :id`,
        { id: item.id },
      );
    }
  }
}

function mobileTaskStatus(step) {
  if (step.taskStatus) return step.taskStatus;
  if (step.status === 'approved') return 'done';
  if (step.status === 'reviewing') return 'in_review';
  if (step.status === 'rejected' || step.status === 'terminated') return 'blocked';
  if (step.status === 'locked') return 'waiting';
  return 'open';
}

// 移动端待办对象在这里统一组装，页面层只消费结果，不再自行拼装流程规则。
function buildTodoItem(user, applicant, workflow, step) {
  const taskOwner = isApplicantActor(user, applicant.userId || applicant.id, step) ? '申请人' : '审核者';
  return {
    workflowId: applicant.userId || applicant.id,
    taskId: step.stepCode,
    applicantId: applicant.userId || applicant.id,
    applicantName: applicant.name,
    stepCode: step.stepCode,
    stepName: step.name,
    phase: step.phase,
    status: step.status,
    statusText: step.statusText,
    taskStatus: mobileTaskStatus(step),
    actorType: step.actorType || step.taskMeta?.actorType || 'reviewer',
    taskOwner,
    summary: step.taskMeta?.taskSummary || '请按要求完成当前节点办理。',
    requiresApplicantAction: Number(step.requiresApplicantAction || step.taskMeta?.requiresApplicantAction || 0) === 1,
    requiresReviewerAction: Number(step.requiresReviewerAction || step.taskMeta?.requiresReviewerAction || 0) === 1,
    canSubmit: isApplicantActor(user, applicant.userId || applicant.id, step),
    canReview: isReviewerActor(user, step),
    canReschedule: step.stepCode === 'STEP_02' && (isApplicantActor(user, applicant.userId || applicant.id, step) || isReviewerActor(user, step)),
    materialSchema: step.materialSchema || step.taskMeta?.materialSchema || [],
    attachments: step.attachments || [],
    formData: step.formData || {},
    rescheduleHistory: step.rescheduleHistory || [],
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
    for (const step of workflow.steps.filter(isMvpStep)) {
      const visibleToApplicant = isApplicantActor(user, applicant.userId || applicant.id, step) && ['pending', 'rejected'].includes(step.status);
      const visibleToReviewer = isReviewerActor(user, step) && ['reviewing', 'pending'].includes(step.status);
      if (!visibleToApplicant && !visibleToReviewer) continue;
      todos.push(buildTodoItem(user, applicant, workflow, step));
    }
  }
  return todos.sort((left, right) => {
    const leftValue = left.operatedAt || '9999-12-31 23:59:59';
    const rightValue = right.operatedAt || '9999-12-31 23:59:59';
    return leftValue.localeCompare(rightValue);
  });
}

// Notification helpers deliberately operate on user IDs only; data-scope
// filtering happens before recipient selection.
async function listNotifications(user, limit = 20) {
  const rows = await query(
    `SELECT
        id,
        type,
        title,
        content,
        related_step_code AS relatedStepCode,
        related_target_type AS relatedTargetType,
        related_target_id AS relatedTargetId,
        status,
        created_at AS createdAt
     FROM notifications
     WHERE user_id = :userId
     ORDER BY created_at DESC
     LIMIT ${Number(limit)}`,
    { userId: user.id },
  );
  return rows;
}

async function createNotification(userId, type, title, content, relatedStepCode = null, relatedTargetType = null, relatedTargetId = null) {
  const createdAt = now();
  await query(
    `INSERT INTO notifications
     (user_id, type, title, content, related_step_code, related_target_type, related_target_id, status, created_at)
     VALUES (:userId, :type, :title, :content, :relatedStepCode, :relatedTargetType, :relatedTargetId, 'unread', :createdAt)`,
    { userId, type, title, content, relatedStepCode, relatedTargetType, relatedTargetId, createdAt },
  );
}

async function recentAuditLogs(user, limit = 8) {
  const rows = await query(
    `SELECT
        action,
        target_type AS targetType,
        target_id AS targetId,
        created_at AS createdAt,
        detail_json AS detailJson
     FROM audit_logs
     WHERE operator_id = :userId
     ORDER BY created_at DESC
     LIMIT ${Number(limit)}`,
    { userId: user.id },
  );
  return rows.map((item) => ({
    ...item,
    detail: parseJson(item.detailJson, {}),
  }));
}

async function buildMobileWorkflow(user, applicantId) {
  if (!(await canAccessApplicant(user, applicantId))) {
    const error = new Error('无权查看该流程');
    error.status = 403;
    throw error;
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
    completedSteps: completedSteps.map((item) => ({
      stepCode: item.stepCode,
      name: item.name,
      phase: item.phase,
      operatedAt: item.operatedAt,
      lastOperatorName: item.lastOperatorName,
      statusText: item.statusText,
    })),
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

function ageFromIdNo(idNo) {
  if (!/^\d{17}[\dXx]$/.test(idNo || '')) return null;
  const year = Number(idNo.slice(6, 10));
  const month = Number(idNo.slice(10, 12));
  const day = Number(idNo.slice(12, 14));
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(birthDate.getTime())) return null;
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  ) {
    return null;
  }
  const nowDate = new Date();
  let age = nowDate.getFullYear() - year;
  const monthGap = nowDate.getMonth() + 1 - month;
  if (monthGap < 0 || (monthGap === 0 && nowDate.getDate() < day)) age -= 1;
  return age;
}

async function ensureAdultApplicant(applicantId) {
  const request = await first(
    `SELECT id_no AS idNo
     FROM registration_requests
     WHERE user_id = :userId
     ORDER BY id DESC
     LIMIT 1`,
    { userId: applicantId },
  );
  const age = ageFromIdNo(request?.idNo || '');
  if (age !== null && age < 18) {
    const error = new Error('未满18周岁，不能提交入党申请');
    error.status = 400;
    throw error;
  }
}

async function getUserScopeById(userId) {
  return first(
    `SELECT id, org_id AS orgId, branch_id AS branchId
     FROM users
     WHERE id = :userId`,
    { userId },
  );
}

function roleMatchesApplicantScope(candidate, applicant) {
  if (candidate.scopeLevel === 'all') return true;
  if (candidate.scopeLevel === 'org') return Boolean(candidate.orgId && candidate.orgId === applicant.orgId);
  if (candidate.scopeLevel === 'branch') return Boolean(candidate.branchId && candidate.branchId === applicant.branchId);
  if (candidate.scopeLevel === 'self') return candidate.id === applicant.id;
  return false;
}

async function notificationRecipientsForStep(step, applicantId, excludeUserIds = []) {
  const applicantScope = await getUserScopeById(applicantId);
  const roleIds = step.responsibleRoles?.length ? step.responsibleRoles : step.taskMeta?.responsibleRoles || [];
  if (!roleIds.length) return [];
  const rows = await query(
    `SELECT DISTINCT
        u.id,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        r.id AS roleId,
        r.scope_level AS scopeLevel
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE r.id IN (${roleIds.map((_, index) => `:roleId${index}`).join(', ')})`,
    Object.fromEntries(roleIds.map((roleId, index) => [`roleId${index}`, roleId])),
  );
  return rows
    .filter((row) => roleMatchesApplicantScope(row, applicantScope))
    .filter((row) => !excludeUserIds.includes(row.id))
    .map((row) => row.id);
}

function fileUrl(fileName) {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/uploads/${fileName}`;
}

// Material validation is intentionally server-side. Frontend accept attributes
// are only hints and must not be trusted for workflow evidence files.
function acceptedTypesForMaterial(step, materialTag) {
  const material = (step.materialSchema || step.taskMeta?.materialSchema || []).find((item) => item.tag === materialTag);
  if (!material) throw errorWithStatus('材料类型不属于当前步骤', 400);
  return material.accept || [];
}

function validateUploadedFile(file, acceptTypes) {
  if (!file) throw errorWithStatus('未上传文件', 400);
  const extension = path.extname(file.originalname || '').toLowerCase();
  const allowed = acceptTypes.flatMap((type) => {
    const rule = FILE_ACCEPT_RULES[type] || { extensions: [], mimeTypes: [] };
    return rule.extensions.map((item) => ({ extension: item, mimeTypes: rule.mimeTypes }));
  });
  if (!allowed.length) return;
  const extensionAllowed = allowed.some((item) => item.extension === extension);
  const mimeAllowed = acceptTypes.some((type) => (FILE_ACCEPT_RULES[type]?.mimeTypes || []).includes(file.mimetype));
  if (!extensionAllowed || !mimeAllowed) {
    throw errorWithStatus('上传文件类型不符合当前材料要求', 400);
  }
}

function workbookBuffer(sheets) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  });
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  env,
  query,
  first,
  getPool,
  ok,
  fail,
  now,
  hashPassword,
  verifyPassword,
  needsPasswordRehash,
  parseJson,
  signToken,
  buildMenus,
  roleScopeLabel,
  profileTypeForRole,
  buildDefaultProfilePayload,
  logAudit,
  getUserWithAuth,
  requireAuth,
  hasPermission,
  requirePermission,
  scopeClause,
  getApplicants,
  canAccessApplicant,
  errorWithStatus,
  stepOrder,
  isMvpStep,
  canAccessScopedRecord,
  assertCanAccessApplicant,
  getApplicantProfileByUserId,
  getUserProfileRecord,
  getProfileViewByUser,
  upsertUserProfile,
  getWechatBindingByUserId,
  statusText,
  statusClass,
  getWorkflowByApplicantId,
  dashboardForUser,
  currentRoleIds,
  primaryRoleLabel,
  isApplicantActor,
  isReviewerActor,
  ensureMvpStep,
  ensurePreviousStepApproved,
  assertWorkflowActor,
  nextTaskStatus,
  advanceAfterReview,
  mobileTaskStatus,
  buildTodoItem,
  listMobileTodos,
  listNotifications,
  createNotification,
  recentAuditLogs,
  buildMobileWorkflow,
  buildMobileWorkbench,
  resolveMobileWorkflowId,
  ageFromIdNo,
  ensureAdultApplicant,
  getUserScopeById,
  roleMatchesApplicantScope,
  notificationRecipientsForStep,
  fileUrl,
  acceptedTypesForMaterial,
  validateUploadedFile,
  workbookBuffer,
  MVP_MAX_STEP_ORDER,
  HIGH_PRIVILEGE_ROLES,
  ALLOWED_REVIEW_STATUSES,
  FILE_ACCEPT_RULES,
};
