const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const jwt = require('jsonwebtoken');
const { env } = require('./env');
const { query, first, getPool } = require('./db');
const { ensureSeedData } = require('./seed');
const { getStepDetail } = require('./workflow-config');

/**
 * 服务端主入口。
 *
 * 当前职责：
 * - 为 PC 后台和服务号网页 App 提供统一认证、流程、资料、统计、上传接口
 * - 把业务规则尽量集中在服务端与配置层，而不是散落在前端页面里
 *
 * 维护提示：
 * - 25 步细化规则优先扩展 workflow-config.js
 * - 《发展党员全程记实表》当前只作为研发参考，应结合会议纪要继续细化字段与材料要求
 */
const app = express();
fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: env.UPLOAD_DIR });
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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.ALLOW_ALL_CORS || env.CORS_ORIGINS.includes('*') || env.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(env.UPLOAD_DIR));

function ok(res, data, message = 'ok') {
  res.json({ code: 0, message, data });
}

function fail(res, status, message, code = status) {
  res.status(status).json({ code, message, data: null });
}

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password || '').digest('hex');
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
  const birth = `${idNo.slice(6, 10)}-${idNo.slice(10, 12)}-${idNo.slice(12, 14)}`;
  const birthDate = new Date(`${birth}T00:00:00+08:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const nowDate = new Date();
  let age = nowDate.getFullYear() - birthDate.getFullYear();
  const monthGap = nowDate.getMonth() - birthDate.getMonth();
  if (monthGap < 0 || (monthGap === 0 && nowDate.getDate() < birthDate.getDate())) age -= 1;
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

app.get('/api/health', async (req, res) => {
  try {
    await getPool().query('SELECT 1');
    ok(res, { now: now(), db: 'ok' });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const userRow = await first('SELECT id, username, password_hash AS passwordHash, status FROM users WHERE username = :username', { username });
    if (!userRow || userRow.passwordHash !== hashPassword(password)) return fail(res, 401, '账号或密码错误');
    if (userRow.status !== 'active') return fail(res, 403, '账号未激活');
    const user = await getUserWithAuth(userRow.id);
    ok(res, { token: signToken(user), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), user });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/auth/me', requireAuth(), async (req, res) => ok(res, req.user));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, idNo, employeeNo, password } = req.body || {};
    const user = await first('SELECT id FROM users WHERE username = :employeeNo', { employeeNo });
    if (!user) return fail(res, 400, '后台未找到预置人员信息');
    await query(
      `INSERT INTO registration_requests (request_no, user_id, name, id_no, employee_no, status, created_at)
       VALUES (:requestNo, :userId, :name, :idNo, :employeeNo, 'pending', :createdAt)`,
      {
        requestNo: `REG${Date.now()}`,
        userId: user.id,
        name,
        idNo,
        employeeNo,
        createdAt: now(),
      },
    );
    if (password) {
      await query('UPDATE users SET password_hash = :passwordHash WHERE id = :userId', {
        passwordHash: hashPassword(password),
        userId: user.id,
      });
    }
    await logAudit('registration_requests', employeeNo, 'submit_registration', user.id, { employeeNo });
    ok(res, true, '注册信息已提交，等待审核');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/auth/approve-registration', requireAuth(), requirePermission('approve_registration'), async (req, res) => {
  try {
    const { requestNo, status = 'approved' } = req.body || {};
    if (!ALLOWED_REVIEW_STATUSES.has(status)) return fail(res, 400, '注册审核状态不合法');
    const request = await first(
      `SELECT
          rr.request_no AS requestNo,
          rr.status,
          rr.user_id AS userId,
          u.id,
          u.org_id AS orgId,
          u.branch_id AS branchId
       FROM registration_requests rr
       INNER JOIN users u ON u.id = rr.user_id
       WHERE rr.request_no = :requestNo`,
      { requestNo },
    );
    if (!request) return fail(res, 404, '未找到注册申请');
    if (request.status !== 'pending') return fail(res, 400, '该注册申请已处理');
    if (!canAccessScopedRecord(req.user, request)) return fail(res, 403, '无权审核该注册申请');
    await query('UPDATE registration_requests SET status = :status, reviewed_at = :reviewedAt WHERE request_no = :requestNo', {
      status,
      reviewedAt: now(),
      requestNo,
    });
    if (status === 'approved') {
      await query('UPDATE users SET status = :status WHERE id = :userId', {
        status: 'active',
        userId: request.userId,
      });
      const currentRole = await first('SELECT id FROM user_roles WHERE user_id = :userId AND role_id = :roleId', {
        userId: request.userId,
        roleId: 'applicant',
      });
      if (!currentRole) {
        await query('INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)', {
          userId: request.userId,
          roleId: 'applicant',
        });
      }
    }
    await logAudit('registration_requests', requestNo, 'approve_registration', req.user.id, { status });
    ok(res, true);
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/wechat/bind/status', requireAuth(), async (req, res) => {
  try {
    const binding = await getWechatBindingByUserId(req.user.id);
    ok(res, {
      bound: !!binding,
      binding,
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/wechat/unbind', requireAuth(), async (req, res) => {
  try {
    await query(
      `UPDATE wechat_bindings
       SET status = 'inactive'
       WHERE user_id = :userId AND status = 'active'`,
      { userId: req.user.id },
    );
    await logAudit('wechat_bindings', req.user.id, 'unbind_wechat', req.user.id, {});
    ok(res, true, '微信账号已解绑');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/wechat/oauth/start', async (req, res) => {
  try {
    if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_REDIRECT_URI) {
      return fail(res, 501, '微信服务号网页授权配置未完成');
    }
    const statePayload = Buffer.from(
      JSON.stringify({
        redirectPath: req.query.redirectPath || '/wx-app/',
        t: Date.now(),
      }),
      'utf8',
    ).toString('base64url');
    const authorizeUrl =
      `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
      `&redirect_uri=${encodeURIComponent(env.WECHAT_SERVICE_REDIRECT_URI)}` +
      '&response_type=code&scope=snsapi_base' +
      `&state=${encodeURIComponent(statePayload)}#wechat_redirect`;
    ok(res, { authorizeUrl });
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/wechat/oauth/callback', async (req, res) => {
  try {
    if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_APP_SECRET) {
      return fail(res, 501, '微信服务号网页授权配置未完成');
    }
    const { code, state = '' } = req.query || {};
    if (!code) return fail(res, 400, '缺少微信授权 code');
    const tokenUrl =
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
      `&secret=${encodeURIComponent(env.WECHAT_SERVICE_APP_SECRET)}` +
      `&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const response = await fetch(tokenUrl);
    const data = await response.json();
    if (!response.ok || data.errcode) {
      return fail(res, 400, data.errmsg || '微信网页授权失败');
    }
    let redirectPath = '/wx-app/';
    try {
      redirectPath = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8')).redirectPath || redirectPath;
    } catch (error) {
      redirectPath = '/wx-app/';
    }
    ok(res, {
      openid: data.openid,
      unionid: data.unionid || '',
      redirectPath,
    });
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/mobile/workbench', requireAuth(), async (req, res) => {
  try {
    ok(res, await buildMobileWorkbench(req.user));
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/mobile/todos', requireAuth(), async (req, res) => {
  try {
    ok(res, await listMobileTodos(req.user));
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/mobile/messages', requireAuth(), async (req, res) => {
  try {
    ok(res, await listNotifications(req.user, 50));
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/mobile/profile', requireAuth(), async (req, res) => {
  try {
    ok(res, await getProfileViewByUser(req.user));
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.put('/api/mobile/profile', requireAuth(), async (req, res) => {
  try {
    const payload = req.body || {};
    await upsertUserProfile(req.user, payload);
    if (req.user.primaryRole === 'applicant') {
      await query(
        `UPDATE applicant_profiles
         SET phone = :phone,
             education = :education,
             degree = :degree,
             unit_name = :unitName,
             occupation = :occupation,
             profile_json = :profileJson,
             updated_at = :updatedAt
         WHERE user_id = :userId`,
        {
          phone: payload.phone || '',
          education: payload.education || '',
          degree: payload.degree || '',
          unitName: payload.unitName || '',
          occupation: payload.occupation || '',
          profileJson: JSON.stringify(payload),
          updatedAt: now(),
          userId: req.user.id,
        },
      );
    }
    await logAudit('mobile_profile', req.user.id, 'save_mobile_profile', req.user.id, payload);
    ok(res, true, '资料已保存');
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/mobile/workflows/:workflowId', requireAuth(), async (req, res) => {
  try {
    const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
    ok(res, await buildMobileWorkflow(req.user, applicantId));
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.post('/api/mobile/workflows/:workflowId/tasks/:taskId/submit', requireAuth(), async (req, res) => {
  try {
    const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
    await assertCanAccessApplicant(req.user, applicantId);
    const workflow = await getWorkflowByApplicantId(applicantId);
    const step = workflow.steps.find((item) => item.stepCode === req.params.taskId);
    assertWorkflowActor(req.user, applicantId, workflow, step, 'submit');
    if (step.stepCode === 'STEP_01') {
      await ensureAdultApplicant(applicantId);
    }
    const mergedFormData = {
      ...step.formData,
      ...(req.body.formData || req.body || {}),
    };
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
        reviewComment: req.body.reviewComment || '',
        operatorId: req.user.id,
        operatedAt: now(),
        id: step.id,
      },
    );
    await logAudit('workflow_step_records', step.id, 'mobile_submit_task', req.user.id, req.body || {});
    const recipients = await notificationRecipientsForStep(step, applicantId, [req.user.id]);
    for (const userId of recipients) {
      await createNotification(
        userId,
        'task_submitted',
        `${step.name}待处理`,
        `${req.user.name}已提交“${step.name}”，请按流程要求及时处理。`,
        step.stepCode,
        'workflow',
        applicantId,
      );
    }
    ok(res, true, '任务已提交');
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.post('/api/mobile/workflows/:workflowId/tasks/:taskId/review', requireAuth(), async (req, res) => {
  try {
    const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
    await assertCanAccessApplicant(req.user, applicantId);
    const workflow = await getWorkflowByApplicantId(applicantId);
    const step = workflow.steps.find((item) => item.stepCode === req.params.taskId);
    assertWorkflowActor(req.user, applicantId, workflow, step, 'review');
    const nextStatus = req.body.status || 'approved';
    if (!ALLOWED_REVIEW_STATUSES.has(nextStatus)) return fail(res, 400, '审核状态不合法');
    await query(
      `UPDATE workflow_step_records
       SET status = :status,
           task_status = :taskStatus,
           review_comment = :reviewComment,
           last_operator_id = :operatorId,
           operated_at = :operatedAt,
           confirmed_at = :confirmedAt
       WHERE id = :id`,
      {
        status: nextStatus,
        taskStatus: nextTaskStatus(nextStatus),
        reviewComment: req.body.comment || '',
        operatorId: req.user.id,
        operatedAt: now(),
        confirmedAt: nextStatus === 'approved' ? now() : null,
        id: step.id,
      },
    );
    await advanceAfterReview(workflow, step, nextStatus);
    await logAudit('workflow_step_records', step.id, 'mobile_review_task', req.user.id, req.body || {});
    await createNotification(
      applicantId,
      'task_reviewed',
      `${step.name}${nextStatus === 'approved' ? '已通过' : '需补充'}`,
      nextStatus === 'approved' ? `“${step.name}”已审核通过，请关注下一步通知。` : `“${step.name}”已退回，请根据意见补充材料。`,
      step.stepCode,
      'workflow',
      applicantId,
    );
    ok(res, true, '审核结果已保存');
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.post('/api/mobile/workflows/:workflowId/tasks/:taskId/reschedule', requireAuth(), async (req, res) => {
  try {
    const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
    await assertCanAccessApplicant(req.user, applicantId);
    const workflow = await getWorkflowByApplicantId(applicantId);
    const step = workflow.steps.find((item) => item.stepCode === req.params.taskId);
    if (!step) return fail(res, 404, '未找到对应任务');
    if (step.stepCode !== 'STEP_02') return fail(res, 400, '当前任务不支持改期');
    if (!(isApplicantActor(req.user, applicantId, step) || isReviewerActor(req.user, step))) {
      return fail(res, 403, '当前账号不能调整该任务时间');
    }
    const nextHistory = [
      ...(step.rescheduleHistory || []),
      {
        operatorId: req.user.id,
        operatorName: req.user.name,
        requestedAt: now(),
        scheduledAt: req.body.scheduledAt || '',
        location: req.body.location || '',
        reason: req.body.reason || '',
      },
    ];
    await query(
      `UPDATE workflow_step_records
       SET task_status = 'reschedule_requested',
           form_data_json = :formDataJson,
           reschedule_count = :rescheduleCount,
           reschedule_history_json = :rescheduleHistoryJson,
           last_operator_id = :operatorId,
           operated_at = :operatedAt
       WHERE id = :id`,
      {
        formDataJson: JSON.stringify({
          ...step.formData,
          meetingProposal: {
            scheduledAt: req.body.scheduledAt || '',
            location: req.body.location || '',
            reason: req.body.reason || '',
          },
        }),
        rescheduleCount: Number(step.rescheduleCount || 0) + 1,
        rescheduleHistoryJson: JSON.stringify(nextHistory),
        operatorId: req.user.id,
        operatedAt: now(),
        id: step.id,
      },
    );
    await logAudit('workflow_step_records', step.id, 'mobile_reschedule_task', req.user.id, req.body || {});
    const recipients = await notificationRecipientsForStep(step, applicantId, [req.user.id]);
    for (const userId of recipients) {
      await createNotification(
        userId,
        'reschedule_requested',
        '谈话时间变更待确认',
        `${req.user.name}提交了新的谈话安排，请尽快确认或调整。`,
        step.stepCode,
        'workflow',
        applicantId,
      );
    }
    ok(res, true, '改期申请已提交');
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.post('/api/mobile/files/upload', requireAuth(), upload.single('file'), async (req, res) => {
  try {
    const { workflowId = '', stepCode = '', materialTag = '' } = req.body || {};
    validateUploadedFile(req.file, ['pdf', 'image']);
    let attachmentId = null;
    if (workflowId && stepCode) {
      const applicantId = resolveMobileWorkflowId(req.user, workflowId);
      await assertCanAccessApplicant(req.user, applicantId);
      const workflow = await getWorkflowByApplicantId(applicantId);
      const step = workflow.steps.find((item) => item.stepCode === stepCode);
      assertWorkflowActor(req.user, applicantId, workflow, step, 'submit');
      validateUploadedFile(req.file, acceptedTypesForMaterial(step, materialTag));
      const instance = await first('SELECT id FROM workflow_instances WHERE applicant_id = :applicantId', { applicantId });
      const stepRecord = await first(
        'SELECT id FROM workflow_step_records WHERE instance_id = :instanceId AND step_code = :stepCode',
        { instanceId: instance.id, stepCode },
      );
      if (stepRecord) {
        const inserted = await query(
          `INSERT INTO attachments (step_record_id, file_name, file_url, mime_type, material_tag, created_at)
           VALUES (:stepRecordId, :fileName, :fileUrl, :mimeType, :materialTag, :createdAt)`,
          {
            stepRecordId: stepRecord.id,
            fileName: req.file.originalname,
            fileUrl: fileUrl(req.file.filename),
            mimeType: req.file.mimetype,
            materialTag,
            createdAt: now(),
          },
        );
        attachmentId = inserted.insertId;
      }
    }
    ok(res, {
      attachmentId,
      fileName: req.file.originalname,
      fileUrl: fileUrl(req.file.filename),
      mimeType: req.file.mimetype,
      materialTag,
      storageName: req.file.filename,
    });
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/dashboard/me', requireAuth(), async (req, res) => {
  try {
    ok(res, await dashboardForUser(req.user));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/profile/me', requireAuth(), async (req, res) => {
  try {
    ok(res, await getProfileViewByUser(req.user));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.put('/api/profile/me', requireAuth(), async (req, res) => {
  try {
    const payload = req.body || {};
    await upsertUserProfile(req.user, payload);
    if (req.user.primaryRole === 'applicant') {
      await query(
        `UPDATE applicant_profiles
         SET phone = :phone,
             education = :education,
             degree = :degree,
             unit_name = :unitName,
             occupation = :occupation,
             profile_json = :profileJson,
             updated_at = :updatedAt
         WHERE user_id = :userId`,
        {
          phone: payload.phone || '',
          education: payload.education || '',
          degree: payload.degree || '',
          unitName: payload.unitName || '',
          occupation: payload.occupation || '',
          profileJson: JSON.stringify(payload),
          updatedAt: now(),
          userId: req.user.id,
        },
      );
      await logAudit('applicant_profiles', req.user.id, 'update_profile', req.user.id, payload);
    } else {
      await logAudit('user_profiles', req.user.id, 'update_profile', req.user.id, payload);
    }
    ok(res, true, '资料已保存');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/users', requireAuth(), async (req, res) => {
  try {
    ok(
      res,
      await query(
        `SELECT u.id, u.username, u.name, o.name AS orgName, b.name AS branchName
         FROM users u
         LEFT JOIN org_units o ON o.id = u.org_id
         LEFT JOIN branches b ON b.id = u.branch_id
         ORDER BY u.username ASC`,
      ),
    );
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/applicants', requireAuth(), async (req, res) => {
  try {
    ok(res, await getApplicants(req.user, req.query || {}));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/applicants/:id', requireAuth(), async (req, res) => {
  try {
    if (!(await canAccessApplicant(req.user, req.params.id))) return fail(res, 403, '无权查看该申请人');
    const profile = await getApplicantProfileByUserId(req.params.id);
    ok(res, {
      ...parseJson(profile?.profileJson, {}),
      userId: profile?.userId,
      username: profile?.username,
      name: profile?.name,
      orgName: profile?.orgName,
      branchName: profile?.branchName,
      currentStage: profile?.currentStage,
      phone: profile?.phone,
      education: profile?.education,
      degree: profile?.degree,
      unitName: profile?.unitName,
      occupation: profile?.occupation,
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/workflows/me', requireAuth(), async (req, res) => {
  try {
    ok(res, await getWorkflowByApplicantId(req.user.id));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/workflows/:applicantId', requireAuth(), async (req, res) => {
  try {
    if (!(await canAccessApplicant(req.user, req.params.applicantId))) return fail(res, 403, '无权查看该流程');
    ok(res, await getWorkflowByApplicantId(req.params.applicantId));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/workflows/:applicantId/steps/:stepCode/submit', requireAuth(), async (req, res) => {
  try {
    await assertCanAccessApplicant(req.user, req.params.applicantId);
    const workflow = await getWorkflowByApplicantId(req.params.applicantId);
    const step = workflow.steps.find((item) => item.stepCode === req.params.stepCode);
    assertWorkflowActor(req.user, req.params.applicantId, workflow, step, 'submit');
    if (step.stepCode === 'STEP_01') {
      await ensureAdultApplicant(req.params.applicantId);
    }
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
        formDataJson: JSON.stringify(req.body.formData || req.body || {}),
        reviewComment: req.body.reviewComment || '',
        operatorId: req.user.id,
        operatedAt: now(),
        id: step.id,
      },
    );
    await logAudit('workflow_step_records', step.id, 'submit_step', req.user.id, req.body);
    ok(res, true, '步骤已提交');
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.post('/api/workflows/:applicantId/steps/:stepCode/review', requireAuth(), async (req, res) => {
  try {
    await assertCanAccessApplicant(req.user, req.params.applicantId);
    const workflow = await getWorkflowByApplicantId(req.params.applicantId);
    const step = workflow.steps.find((item) => item.stepCode === req.params.stepCode);
    assertWorkflowActor(req.user, req.params.applicantId, workflow, step, 'review');
    const nextStatus = req.body.status || 'approved';
    if (!ALLOWED_REVIEW_STATUSES.has(nextStatus)) return fail(res, 400, '审核状态不合法');
    await query(
      `UPDATE workflow_step_records
       SET status = :status,
           task_status = :taskStatus,
           review_comment = :reviewComment,
           last_operator_id = :operatorId,
           operated_at = :operatedAt,
           confirmed_at = :confirmedAt
       WHERE id = :id`,
      {
        status: nextStatus,
        taskStatus: nextTaskStatus(nextStatus),
        reviewComment: req.body.comment || '',
        operatorId: req.user.id,
        operatedAt: now(),
        confirmedAt: nextStatus === 'approved' ? now() : null,
        id: step.id,
      },
    );
    await advanceAfterReview(workflow, step, nextStatus);
    await logAudit('workflow_step_records', step.id, 'review_step', req.user.id, req.body);
    ok(res, true, '审核结果已保存');
  } catch (error) {
    fail(res, error.status || 500, error.message);
  }
});

app.get('/api/workflow-steps/config', requireAuth(), async (req, res) => {
  try {
    ok(
      res,
      await query(
        `SELECT step_code AS stepCode, sort_order AS sortOrder, name, phase, start_at AS startAt, end_at AS endAt
         FROM workflow_step_definitions
         ORDER BY sort_order ASC`,
      ),
    );
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.put('/api/workflow-steps/config/:stepCode', requireAuth(), requirePermission('configure_workflow'), async (req, res) => {
  try {
    await query(
      `UPDATE workflow_step_definitions
       SET start_at = :startAt, end_at = :endAt
       WHERE step_code = :stepCode`,
      {
        startAt: req.body.startAt,
        endAt: req.body.endAt,
        stepCode: req.params.stepCode,
      },
    );
    await logAudit('workflow_step_definitions', req.params.stepCode, 'update_step_config', req.user.id, req.body);
    ok(res, true, '流程配置已更新');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/files/upload', requireAuth(), upload.single('file'), async (req, res) => {
  try {
    ok(res, {
      fileName: req.file.originalname,
      fileUrl: fileUrl(req.file.filename),
      mimeType: req.file.mimetype,
      storageName: req.file.filename,
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/orgs', requireAuth(), async (req, res) => {
  try {
    ok(res, await query('SELECT id, name FROM org_units ORDER BY name ASC'));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/branches', requireAuth(), async (req, res) => {
  try {
    ok(res, await query('SELECT id, name, org_id AS orgId FROM branches ORDER BY name ASC'));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/orgs/import-staff', requireAuth(), async (req, res) => {
  try {
    await logAudit('staff_import', 'batch', 'import_staff', req.user.id, req.body || {});
    ok(res, { imported: Number(req.body?.rows || 0) }, '导入登记已记录');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/orgs/assign-role', requireAuth(), requirePermission('assign_roles'), async (req, res) => {
  try {
    const { userId, roleId } = req.body || {};
    const targetUser = await first(
      `SELECT id, org_id AS orgId, branch_id AS branchId
       FROM users
       WHERE id = :userId`,
      { userId },
    );
    if (!targetUser) return fail(res, 404, '未找到目标用户');
    if (!canAccessScopedRecord(req.user, targetUser)) return fail(res, 403, '无权为该用户分配角色');
    const role = await first('SELECT id FROM roles WHERE id = :roleId', { roleId });
    if (!role) return fail(res, 400, '角色不存在');
    if (HIGH_PRIVILEGE_ROLES.has(roleId) && req.user.primaryRole !== 'superAdmin') return fail(res, 403, '无权分配高权限角色');
    const current = await first('SELECT id FROM user_roles WHERE user_id = :userId AND role_id = :roleId', { userId, roleId });
    if (!current) {
      await query('INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)', { userId, roleId });
    }
    await logAudit('user_roles', `${userId}:${roleId}`, 'assign_role', req.user.id, req.body);
    ok(res, true, '角色分配成功');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/reviews/pending', requireAuth(), async (req, res) => {
  try {
    const scope = scopeClause(req.user, 'u');
    ok(
      res,
      await query(
        `SELECT
            i.applicant_id AS applicantId,
            r.step_code AS stepCode,
            d.name AS stepName,
            r.status,
            r.deadline,
            u.name AS applicantName,
            o.name AS orgName,
            b.name AS branchName
         FROM workflow_step_records r
         INNER JOIN workflow_instances i ON i.id = r.instance_id
         INNER JOIN workflow_step_definitions d ON d.step_code = r.step_code
         INNER JOIN users u ON u.id = i.applicant_id
         LEFT JOIN org_units o ON o.id = u.org_id
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE r.status = 'reviewing'
         ${scope.sql}
         ORDER BY r.deadline ASC, d.sort_order ASC`,
        scope.params,
      ),
    );
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/stats/overview', requireAuth(), async (req, res) => {
  try {
    const applicants = await getApplicants(req.user, {});
    const pendingRegistrations = await first('SELECT COUNT(*) AS count FROM registration_requests WHERE status = :status', { status: 'pending' });
    const scope = scopeClause(req.user, 'u');
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
    ok(res, {
      totalApplicants: applicants.length,
      pendingRegistrations: pendingRegistrations?.count || 0,
      pendingReviews: pendingReviews?.count || 0,
      overdueItems: 0,
      stageDistribution: Object.entries(stageMap).map(([stage, count]) => ({ stage, count })),
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/stats/by-org', requireAuth(), async (req, res) => {
  try {
    const applicants = await getApplicants(req.user, {});
    const map = new Map();
    applicants.forEach((item) => {
      const key = item.orgName || '未分配单位';
      const row = map.get(key) || { orgName: key, applicants: 0, pending: 0, reviewing: 0 };
      row.applicants += 1;
      if (item.currentStage === '入党申请人') row.pending += 1;
      if (['发展对象', '预备党员'].includes(item.currentStage)) row.reviewing += 1;
      map.set(key, row);
    });
    ok(res, Array.from(map.values()));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/stats/by-branch', requireAuth(), async (req, res) => {
  try {
    const applicants = await getApplicants(req.user, {});
    const map = new Map();
    applicants.forEach((item) => {
      const key = item.branchName || '未分配支部';
      const row = map.get(key) || { branchName: key, applicants: 0, activeSteps: 0 };
      row.applicants += 1;
      if (!['正式党员', '终止发展'].includes(item.currentStage)) row.activeSteps += 1;
      map.set(key, row);
    });
    ok(res, Array.from(map.values()));
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/export/applicants', requireAuth(), async (req, res) => {
  try {
    const buffer = workbookBuffer([{ name: '申请人台账', rows: await getApplicants(req.user, req.query || {}) }]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="applicants.xlsx"');
    res.end(buffer);
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/export/workflows', requireAuth(), async (req, res) => {
  try {
    const applicants = await getApplicants(req.user, {});
    const rows = [];
    for (const applicant of applicants) {
      const workflow = await getWorkflowByApplicantId(applicant.id);
      workflow.steps.forEach((step) => {
        rows.push({
          applicantName: applicant.name,
          orgName: applicant.orgName,
          branchName: applicant.branchName,
          stepCode: step.stepCode,
          stepName: step.name,
          status: step.status,
          deadline: step.deadline,
        });
      });
    }
    const buffer = workbookBuffer([{ name: '流程台账', rows }]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="workflows.xlsx"');
    res.end(buffer);
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.get('/api/export/stats', requireAuth(), async (req, res) => {
  try {
    const applicants = await getApplicants(req.user, {});
    const orgMap = new Map();
    const branchMap = new Map();
    applicants.forEach((item) => {
      const orgKey = item.orgName || '未分配单位';
      const orgRow = orgMap.get(orgKey) || { orgName: orgKey, applicants: 0 };
      orgRow.applicants += 1;
      orgMap.set(orgKey, orgRow);
      const branchKey = item.branchName || '未分配支部';
      const branchRow = branchMap.get(branchKey) || { branchName: branchKey, applicants: 0 };
      branchRow.applicants += 1;
      branchMap.set(branchKey, branchRow);
    });
    const buffer = workbookBuffer([
      { name: '单位统计', rows: Array.from(orgMap.values()) },
      { name: '支部统计', rows: Array.from(branchMap.values()) },
    ]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="stats.xlsx"');
    res.end(buffer);
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// 启动阶段只负责准备基础数据和监听端口，不在这里叠加运维副作用。
async function bootstrap() {
  await ensureSeedData();
  app.listen(env.PORT, () => {
    console.log(`party-building server listening at http://0.0.0.0:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
