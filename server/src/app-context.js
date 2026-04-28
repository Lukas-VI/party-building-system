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
/**
 * Send the standard successful API envelope used by all clients.
 */
function ok(res, data, message = 'ok') {
  res.json({ code: 0, message, data });
}

/**
 * Send the standard error API envelope with an HTTP status code.
 */
function fail(res, status, message, code = status) {
  res.status(status).json({ code, message, data: null });
}

/**
 * Return a MySQL DATETIME-compatible timestamp for audit and workflow writes.
 */
function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Parse JSON columns defensively and fall back when legacy rows contain empty or invalid data.
 */
function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

/**
 * Create the short-lived application JWT from the authenticated user snapshot.
 */
function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username, role: user.primaryRole }, env.JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Translate backend permissions into frontend menu identifiers.
 */
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

/**
 * Describe the data scope implied by the user primary role.
 */
function roleScopeLabel(user) {
  if (user.primaryRole === 'applicant') return '本人数据';
  if (user.primaryRole === 'branchSecretary') return '本支部数据';
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) return '本单位数据';
  return '全校数据';
}

/**
 * Load a small, dynamic set of test accounts for fast fill-in during acceptance.
 *
 * Frontends may display these usernames as convenience hints, but must not hardcode
 * them locally. The backend remains the single source of truth for which accounts
 * are safe to expose in the current environment.
 */
async function listLoginHints() {
  const rows = await query(
    `SELECT
        u.username,
        u.name,
        r.id AS roleId,
        r.label AS roleLabel
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE u.status = 'active'
       AND r.id IN ('applicant', 'branchSecretary', 'organizer', 'orgDept', 'superAdmin')
     ORDER BY
       CASE r.id
         WHEN 'applicant' THEN 1
         WHEN 'branchSecretary' THEN 2
         WHEN 'organizer' THEN 3
         WHEN 'orgDept' THEN 4
         WHEN 'superAdmin' THEN 5
         ELSE 99
       END,
       u.username ASC`,
  );

  const byRole = new Map();
  rows.forEach((item) => {
    if (!byRole.has(item.roleId)) {
      byRole.set(item.roleId, {
        username: item.username,
        name: item.name,
        roleLabel: item.roleLabel,
      });
    }
  });
  return Array.from(byRole.values());
}

/**
 * Build the small bootstrap payload shared by both login screens and workbenches.
 */
async function buildPublicBootstrap() {
  return {
    loginHints: await listLoginHints(),
    defaultPasswordHint: env.TEST_DEFAULT_PASSWORD_HINT,
  };
}

// 当前仍按申请人、基层管理、管理员三类资料视图区分，不要回退成一套混合表单。
/**
 * Map a role identifier to the profile schema family used by forms and seed data.
 */
function profileTypeForRole(role) {
  if (role === 'applicant') return 'applicant';
  if (['branchSecretary', 'organizer'].includes(role)) return 'cadre';
  return 'admin';
}

// 这里只生成资料视图默认值，不在这里写死后续可能变化的完整业务字段。
/**
 * Build role-specific profile defaults before merging persisted profile fields.
 */
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

/**
 * Append one audit trail row for security-sensitive or workflow-changing operations.
 */
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
/**
 * Load a user together with roles, permissions and derived frontend menu access.
 */
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
/**
 * Authenticate Bearer JWT requests and attach the hydrated user to req.user.
 */
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

/**
 * Check whether a hydrated user owns a named backend permission.
 */
function hasPermission(user, permissionId) {
  return (user.permissions || []).some((item) => item.id === permissionId);
}

/**
 * Build an Express guard that rejects callers missing the required permission.
 */
function requirePermission(permissionId) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permissionId)) return fail(res, 403, '无权执行该操作');
    return next();
  };
}

// 数据范围约束集中维护在这里，避免每个查询接口手写一套权限过滤。
/**
 * Create SQL fragments that constrain applicant queries to the caller data scope.
 */
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

/**
 * List applicant rows visible to the caller, with optional table filters applied inside scope.
 */
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

/**
 * List registration requests within the caller data scope.
 */
async function listRegistrationRequests(user, filters = {}) {
  const scope = scopeClause(user, 'u');
  return query(
    `SELECT
        rr.request_no AS requestNo,
        rr.user_id AS userId,
        rr.name,
        rr.employee_no AS employeeNo,
        rr.status,
        rr.created_at AS createdAt,
        rr.reviewed_at AS reviewedAt,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        o.name AS orgName,
        b.name AS branchName
     FROM registration_requests rr
     INNER JOIN users u ON u.id = rr.user_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE 1 = 1
       ${scope.sql}
       ${filters.status ? ' AND rr.status = :status' : ''}
     ORDER BY
       CASE WHEN rr.status = 'pending' THEN 0 ELSE 1 END,
       rr.created_at DESC`,
    {
      ...scope.params,
      status: filters.status || undefined,
    },
  );
}

/**
 * Check whether the caller data scope covers one applicant user id.
 */
async function canAccessApplicant(user, applicantId) {
  const rows = await getApplicants(user, {});
  return rows.some((item) => item.id === applicantId);
}

/**
 * Create an Error that route handlers can translate into the intended HTTP status.
 */
function errorWithStatus(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Extract the numeric order from a STEP_xx workflow code.
 */
function stepOrder(stepCode) {
  const match = /^STEP_(\d+)$/.exec(stepCode || '');
  return match ? Number(match[1]) : null;
}

/**
 * Tell whether a workflow step is open in the current first-12-step MVP boundary.
 */
function isMvpStep(step) {
  return Number(step.sortOrder || stepOrder(step.stepCode) || 0) <= MVP_MAX_STEP_ORDER;
}

/**
 * Check data-scope coverage for records that already contain org, branch or user ids.
 */
function canAccessScopedRecord(user, record) {
  if (user.primaryRole === 'applicant') return user.id === record.id || user.id === record.userId;
  if (user.primaryRole === 'branchSecretary') return Boolean(user.branchId && user.branchId === record.branchId);
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) return Boolean(user.orgId && user.orgId === record.orgId);
  return true;
}

/**
 * Throw a 403 error when the caller cannot access the applicant workflow owner.
 */
async function assertCanAccessApplicant(user, applicantId) {
  if (!(await canAccessApplicant(user, applicantId))) {
    throw errorWithStatus('无权访问该申请人', 403);
  }
}

/**
 * Load the applicant profile view model for a user id.
 */
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

/**
 * Load the generic role profile JSON stored for a user.
 */
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
/**
 * Compose the role-aware profile response returned to PC and H5 clients.
 */
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

/**
 * Persist the role-aware profile JSON for the current user.
 */
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

/**
 * Create the minimum applicant profile, workflow instance and step records
 * needed after a registration request is approved.
 */
async function ensureApplicantEnrollment(userId) {
  const user = await getUserWithAuth(userId);
  if (!user) return;

  const existingProfile = await first(
    `SELECT user_id AS userId
     FROM applicant_profiles
     WHERE user_id = :userId`,
    { userId },
  );
  if (!existingProfile) {
    const profilePayload = buildDefaultProfilePayload({
      ...user,
      primaryRole: 'applicant',
    });
    await query(
      `INSERT INTO applicant_profiles
        (user_id, current_stage, phone, education, degree, unit_name, occupation, profile_json, updated_at)
       VALUES (:userId, '入党申请人', '', '', '', :unitName, '', :profileJson, :updatedAt)`,
      {
        userId,
        unitName: user.orgName || '',
        profileJson: JSON.stringify(profilePayload),
        updatedAt: now(),
      },
    );
  }

  const workflowInstanceId = `wf-${userId}`;
  const existingWorkflow = await first(
    `SELECT id
     FROM workflow_instances
     WHERE applicant_id = :applicantId`,
    { applicantId: userId },
  );
  if (!existingWorkflow) {
    await query(
      `INSERT INTO workflow_instances (id, applicant_id, current_stage, updated_at)
       VALUES (:id, :applicantId, '入党申请人', :updatedAt)`,
      {
        id: workflowInstanceId,
        applicantId: userId,
        updatedAt: now(),
      },
    );
  }

  const existingStep = await first(
    `SELECT id
     FROM workflow_step_records
     WHERE instance_id = :instanceId
     LIMIT 1`,
    { instanceId: workflowInstanceId },
  );
  if (!existingStep) {
    const definitions = await query(
      `SELECT
          step_code AS stepCode,
          sort_order AS sortOrder,
          end_at AS endAt
       FROM workflow_step_definitions
       ORDER BY sort_order ASC`,
    );
    for (const item of definitions) {
      const isFirstStep = Number(item.sortOrder || 0) === 1;
      await query(
        `INSERT INTO workflow_step_records
          (instance_id, step_code, status, form_data_json, review_comment, last_operator_id, operated_at, deadline, task_status, confirmed_at, reschedule_count, reschedule_history_json)
         VALUES
          (:instanceId, :stepCode, :status, :formDataJson, '', NULL, NULL, :deadline, :taskStatus, NULL, 0, :rescheduleHistoryJson)`,
        {
          instanceId: workflowInstanceId,
          stepCode: item.stepCode,
          status: isFirstStep ? 'pending' : 'locked',
          formDataJson: JSON.stringify({}),
          deadline: item.endAt,
          taskStatus: isFirstStep ? 'open' : 'waiting',
          rescheduleHistoryJson: JSON.stringify([]),
        },
      );
    }
  }

  const profileRecord = await getUserProfileRecord(userId);
  if (!profileRecord) {
    await upsertUserProfile(
      { ...user, primaryRole: 'applicant' },
      buildDefaultProfilePayload({ ...user, primaryRole: 'applicant' }),
    );
  }
}

/**
 * Load the active service-account WeChat binding for a user.
 */
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

/**
 * Map internal workflow statuses to display text.
 */
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

/**
 * Map internal workflow statuses to badge class names expected by the UI.
 */
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

/**
 * Load one workflow instance with parsed step metadata, form data and attachments.
 */
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

/**
 * Build dashboard metrics constrained to the caller scope.
 */
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

// Workflow actor checks protect both PC and H5 endpoints. Keep all future step
// state rules here instead of duplicating them in route handlers.
/**
 * Return all role ids carried by the hydrated user.
 */
function currentRoleIds(user) {
  return (user.roles || []).map((item) => item.id);
}

/**
 * Return the display label of the user primary role.
 */
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

function configuredMaterialSchema(step) {
  if (step.taskMeta?.materialSchema?.length) return step.taskMeta.materialSchema;
  return step.materialSchema || [];
}

/**
 * Check whether the caller may act as the applicant for a workflow step.
 */
function isApplicantActor(user, applicantId, step) {
  return user.primaryRole === 'applicant' && user.id === applicantId && configuredFlag(step, 'requiresApplicantAction');
}

/**
 * Check whether the caller may review a workflow step through any assigned role.
 */
function isReviewerActor(user, step) {
  if (user.primaryRole === 'applicant') return false;
  const responsibleRoles = configuredResponsibleRoles(step);
  return responsibleRoles.some((roleId) => currentRoleIds(user).includes(roleId)) && configuredFlag(step, 'requiresReviewerAction');
}

/**
 * Reject workflow actions outside the current first-12-step MVP boundary.
 */
function ensureMvpStep(step) {
  if (!isMvpStep(step)) {
    throw errorWithStatus('该流程节点暂未纳入前12步MVP，暂不开放办理', 400);
  }
}

/**
 * Reject workflow actions when the nearest prior MVP step is not complete.
 */
function ensurePreviousStepApproved(workflow, step) {
  const previous = workflow.steps
    .filter((item) => isMvpStep(item) && Number(item.sortOrder || 0) < Number(step.sortOrder || 0))
    .sort((left, right) => Number(right.sortOrder || 0) - Number(left.sortOrder || 0))[0];
  if (previous && previous.status !== 'approved') {
    throw errorWithStatus('上一流程节点未完成，不能办理当前节点', 400);
  }
}

/**
 * Enforce workflow step state, ordering and actor rules for submit or review actions.
 */
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

/**
 * Translate a review result into the task status consumed by mobile workbench views.
 */
function nextTaskStatus(status) {
  if (status === 'approved') return 'done';
  if (status === 'pending') return 'open';
  if (status === 'rejected') return 'blocked';
  if (status === 'terminated') return 'blocked';
  return 'in_review';
}

/**
 * Open the next MVP step after approval or relock later unfinished steps after rejection.
 */
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

/**
 * Normalize workflow status fields into the mobile task-state vocabulary.
 */
function mobileTaskStatus(step) {
  if (step.taskStatus) return step.taskStatus;
  if (step.status === 'approved') return 'done';
  if (step.status === 'reviewing') return 'in_review';
  if (step.status === 'rejected' || step.status === 'terminated') return 'blocked';
  if (step.status === 'locked') return 'waiting';
  return 'open';
}

/**
 * Normalize workflow statuses into the three-state visual vocabulary used by H5 cards.
 */
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

// 移动端待办对象在这里统一组装，页面层只消费结果，不再自行拼装流程规则。
/**
 * Build the mobile task card shape from workflow, applicant and actor state.
 */
function buildTodoItem(user, applicant, workflow, step) {
  const taskOwner = isApplicantActor(user, applicant.userId || applicant.id, step) ? '申请人' : '审核者';
  const materialSchema = configuredMaterialSchema(step);
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
    requiresApplicantAction: configuredFlag(step, 'requiresApplicantAction'),
    requiresReviewerAction: configuredFlag(step, 'requiresReviewerAction'),
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

/**
 * List actionable mobile tasks visible to the current user.
 */
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

// Notification helpers deliberately operate on user IDs only; data-scope
// filtering happens before recipient selection.
/**
 * List recent notifications for the current user.
 */
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
  return rows.map((item) => normalizeNotification(item));
}

/**
 * Convert notification rows to the H5 and service-account deep-link contract.
 */
function normalizeNotification(item) {
  const targetWorkflowId = item.relatedTargetType === 'workflow' ? String(item.relatedTargetId || '').replace(/^wf-/, '') : '';
  const targetRoute = targetWorkflowId
    ? `/workflow/${targetWorkflowId}/steps/${item.relatedStepCode || ''}?notificationId=${item.id}`
    : '';
  return {
    ...item,
    isUnread: item.status === 'unread',
    targetWorkflowId,
    targetRoute,
    targetLabel: item.relatedStepCode ? `流程节点 ${item.relatedStepCode}` : '消息详情',
  };
}

/**
 * Load one notification owned by the current user.
 */
async function getNotificationForUser(user, notificationId) {
  const row = await first(
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
     WHERE id = :id AND user_id = :userId`,
    { id: notificationId, userId: user.id },
  );
  if (!row) throw errorWithStatus('未找到消息', 404);
  return normalizeNotification(row);
}

/**
 * Mark one owned notification as read and preserve a click receipt when present.
 */
async function markNotificationRead(user, notificationId) {
  const notification = await getNotificationForUser(user, notificationId);
  await query(
    `UPDATE notifications
     SET status = 'read'
     WHERE id = :id AND user_id = :userId`,
    { id: notificationId, userId: user.id },
  );
  await query(
    `UPDATE notification_receipts
     SET status = 'clicked',
         clicked_at = COALESCE(clicked_at, :clickedAt)
     WHERE notification_id = :notificationId AND user_id = :userId`,
    { notificationId, userId: user.id, clickedAt: now() },
  );
  return { ...notification, status: 'read', isUnread: false };
}

/**
 * Create a notification row for a specific recipient.
 *
 * The notification record is the current in-system message source. The receipt
 * row is kept as the later service-account push/click bridge, so message links
 * can jump back to the exact workflow step after WeChat integration is added.
 */
async function createNotification(userId, type, title, content, relatedStepCode = null, relatedTargetType = null, relatedTargetId = null) {
  const createdAt = now();
  const inserted = await query(
    `INSERT INTO notifications
     (user_id, type, title, content, related_step_code, related_target_type, related_target_id, status, created_at)
     VALUES (:userId, :type, :title, :content, :relatedStepCode, :relatedTargetType, :relatedTargetId, 'unread', :createdAt)`,
    { userId, type, title, content, relatedStepCode, relatedTargetType, relatedTargetId, createdAt },
  );
  if (inserted.insertId) {
    await query(
      `INSERT INTO notification_receipts
       (notification_id, user_id, status, created_at)
       VALUES (:notificationId, :userId, 'sent', :createdAt)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      { notificationId: inserted.insertId, userId, createdAt },
    );
  }
  return inserted.insertId || null;
}

/**
 * List recent audit events performed by the current user.
 */
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

/**
 * Build the mobile workflow detail response while enforcing applicant data scope.
 */
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
    completedSteps: completedSteps.map((item) => buildTodoItem(user, { ...applicant, userId: applicantId }, workflow, item)),
    steps: mvpSteps.map((item) => buildTodoItem(user, { ...applicant, userId: applicantId }, workflow, item)),
    todos: todoSteps,
  };
}

/**
 * Assemble the mobile workbench summary, next task, messages and recent activity.
 */
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

/**
 * Resolve the mobile convenience workflow id alias into a concrete applicant id.
 */
function resolveMobileWorkflowId(user, workflowId) {
  return workflowId === 'me' ? user.id : workflowId;
}

/**
 * Calculate applicant age from a Chinese identity number when the value is structurally valid.
 */
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

/**
 * Reject STEP_01 submission when the latest registration identity number is under 18.
 */
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

/**
 * Load the minimal org and branch identifiers needed for recipient scope checks.
 */
async function getUserScopeById(userId) {
  return first(
    `SELECT id, org_id AS orgId, branch_id AS branchId
     FROM users
     WHERE id = :userId`,
    { userId },
  );
}

/**
 * Check whether one candidate reviewer role can cover an applicant scope.
 */
function roleMatchesApplicantScope(candidate, applicant) {
  if (candidate.scopeLevel === 'all') return true;
  if (candidate.scopeLevel === 'org') return Boolean(candidate.orgId && candidate.orgId === applicant.orgId);
  if (candidate.scopeLevel === 'branch') return Boolean(candidate.branchId && candidate.branchId === applicant.branchId);
  if (candidate.scopeLevel === 'self') return candidate.id === applicant.id;
  return false;
}

/**
 * Find scoped recipients for the responsible roles of a workflow step.
 */
async function notificationRecipientsForStep(step, applicantId, excludeUserIds = []) {
  const applicantScope = await getUserScopeById(applicantId);
  const roleIds = configuredResponsibleRoles(step);
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

async function ensureSystemSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(128) PRIMARY KEY,
      setting_value TEXT NULL,
      description VARCHAR(255) NULL,
      updated_by VARCHAR(64) NULL,
      updated_at DATETIME NOT NULL
    )
  `);
}

async function getSystemSetting(settingKey, fallbackValue = '') {
  await ensureSystemSettingsTable();
  const row = await first(
    `SELECT setting_value AS settingValue
     FROM system_settings
     WHERE setting_key = :settingKey`,
    { settingKey },
  );
  return row ? row.settingValue : fallbackValue;
}

async function setSystemSetting(settingKey, settingValue, description = '', operatorId = null) {
  await ensureSystemSettingsTable();
  await query(
    `INSERT INTO system_settings
      (setting_key, setting_value, description, updated_by, updated_at)
     VALUES (:settingKey, :settingValue, :description, :operatorId, :updatedAt)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       description = VALUES(description),
       updated_by = VALUES(updated_by),
       updated_at = VALUES(updated_at)`,
    { settingKey, settingValue, description, operatorId, updatedAt: now() },
  );
}

async function getWorkflowSettings() {
  const enforceTimeLimit = await getSystemSetting('workflow.enforceTimeLimit', 'false');
  return {
    enforceTimeLimit: enforceTimeLimit === 'true',
  };
}

async function updateWorkflowSettings(user, payload = {}) {
  if (user.primaryRole !== 'superAdmin') {
    throw errorWithStatus('仅超级管理员可修改流程调试开关', 403);
  }
  const enabled = Boolean(payload.enforceTimeLimit);
  await setSystemSetting(
    'workflow.enforceTimeLimit',
    enabled ? 'true' : 'false',
    '是否启用流程节点开始/截止时间校验；默认关闭以便联调。',
    user.id,
  );
  await logAudit('system_settings', 'workflow.enforceTimeLimit', 'update_workflow_settings', user.id, { enforceTimeLimit: enabled });
  return getWorkflowSettings();
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

async function validateRequiredMaterials(step) {
  const requiredMaterials = configuredMaterialSchema(step).filter((item) => item.required);
  if (!requiredMaterials.length) return;
  const rows = await query(
    `SELECT material_tag AS materialTag, file_name AS fileName, mime_type AS mimeType
     FROM attachments
     WHERE step_record_id = :stepRecordId`,
    { stepRecordId: step.id },
  );
  for (const material of requiredMaterials) {
    const matched = rows.filter((item) => item.materialTag === material.tag);
    if (!matched.length) {
      throw errorWithStatus(`请上传${material.label}`, 400);
    }
    const acceptedRules = material.accept || [];
    if (acceptedRules.length) {
      for (const item of matched) {
        const extension = path.extname(item.fileName || '').toLowerCase();
        const extensionAllowed = acceptedRules.some((type) => (FILE_ACCEPT_RULES[type]?.extensions || []).includes(extension));
        const mimeAllowed = acceptedRules.some((type) => (FILE_ACCEPT_RULES[type]?.mimeTypes || []).includes(item.mimeType));
        if (!extensionAllowed || !mimeAllowed) {
          throw errorWithStatus(`${material.label}文件类型不符合要求`, 400);
        }
      }
    }
  }
}

async function notifyWorkflowSubmission(user, applicantId, step) {
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

/**
 * Build a public upload URL from a multer storage filename.
 */
function fileUrl(fileName) {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/uploads/${fileName}`;
}

// Material validation is intentionally server-side. Frontend accept attributes
// are only hints and must not be trusted for workflow evidence files.
/**
 * Resolve accepted upload types for one material tag on a workflow step.
 */
function acceptedTypesForMaterial(step, materialTag) {
  const material = configuredMaterialSchema(step).find((item) => item.tag === materialTag);
  if (!material) throw errorWithStatus('材料类型不属于当前步骤', 400);
  return material.accept || [];
}

/**
 * Validate that an uploaded file exists and matches the configured extension and MIME type.
 */
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

/**
 * Render one or more JSON row sets into an XLSX workbook buffer.
 */
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
  listLoginHints,
  buildPublicBootstrap,
  profileTypeForRole,
  buildDefaultProfilePayload,
  logAudit,
  getUserWithAuth,
  requireAuth,
  hasPermission,
  requirePermission,
  scopeClause,
  getApplicants,
  listRegistrationRequests,
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
  ensureApplicantEnrollment,
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
  resolveReviewOutcome,
  mobileTaskStatus,
  mobileReviewState,
  daysUntil,
  remainingLabel,
  buildTodoItem,
  listMobileTodos,
  listNotifications,
  createNotification,
  normalizeNotification,
  getNotificationForUser,
  markNotificationRead,
  recentAuditLogs,
  buildMobileWorkflow,
  buildMobileWorkbench,
  resolveMobileWorkflowId,
  ageFromIdNo,
  ensureAdultApplicant,
  getUserScopeById,
  roleMatchesApplicantScope,
  notificationRecipientsForStep,
  getWorkflowSettings,
  updateWorkflowSettings,
  submitWorkflowTask,
  reviewWorkflowTask,
  fileUrl,
  acceptedTypesForMaterial,
  validateUploadedFile,
  workbookBuffer,
  MVP_MAX_STEP_ORDER,
  HIGH_PRIVILEGE_ROLES,
  ALLOWED_REVIEW_STATUSES,
  FILE_ACCEPT_RULES,
};
