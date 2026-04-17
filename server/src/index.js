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

const app = express();
fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: env.UPLOAD_DIR });

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.CORS_ORIGINS.includes('*') || env.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin not allowed'));
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

async function getProfileByUserId(userId) {
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
  const steps = await query(
    `SELECT
        r.id,
        r.step_code AS stepCode,
        d.sort_order AS sortOrder,
        d.name,
        d.phase,
        d.allowed_roles_json AS allowedRolesJson,
        d.form_schema_json AS formSchemaJson,
        d.start_at AS startAt,
        d.end_at AS endAt,
        r.status,
        r.form_data_json AS formDataJson,
        r.review_comment AS reviewComment,
        r.last_operator_id AS lastOperatorId,
        lu.name AS lastOperatorName,
        r.operated_at AS operatedAt,
        r.deadline,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', a.id,
              'fileName', a.file_name,
              'fileUrl', a.file_url,
              'mimeType', a.mime_type
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
      formData: parseJson(item.formDataJson, {}),
      attachments: parseJson(item.attachmentsJson, []),
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
    scopeLabel: user.primaryRole === 'applicant' ? '本人数据' : user.primaryRole === 'branchSecretary' ? '本支部数据' : ['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole) ? '本单位数据' : '全校数据',
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

function fileUrl(fileName) {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/uploads/${fileName}`;
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

app.post('/api/auth/approve-registration', requireAuth(), async (req, res) => {
  try {
    const { requestNo, status = 'approved' } = req.body || {};
    await query('UPDATE registration_requests SET status = :status, reviewed_at = :reviewedAt WHERE request_no = :requestNo', {
      status,
      reviewedAt: now(),
      requestNo,
    });
    await logAudit('registration_requests', requestNo, 'approve_registration', req.user.id, { status });
    ok(res, true);
  } catch (error) {
    fail(res, 500, error.message);
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
    const profile = await getProfileByUserId(req.user.id);
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

app.put('/api/profile/me', requireAuth(), async (req, res) => {
  try {
    const payload = req.body || {};
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
    const profile = await getProfileByUserId(req.params.id);
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
    const instance = await first('SELECT id FROM workflow_instances WHERE applicant_id = :applicantId', { applicantId: req.params.applicantId });
    const stepRecord = await first('SELECT id FROM workflow_step_records WHERE instance_id = :instanceId AND step_code = :stepCode', {
      instanceId: instance.id,
      stepCode: req.params.stepCode,
    });
    await query(
      `UPDATE workflow_step_records
       SET status = 'reviewing',
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
        id: stepRecord.id,
      },
    );
    await logAudit('workflow_step_records', stepRecord.id, 'submit_step', req.user.id, req.body);
    ok(res, true, '步骤已提交');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

app.post('/api/workflows/:applicantId/steps/:stepCode/review', requireAuth(), async (req, res) => {
  try {
    const instance = await first('SELECT id FROM workflow_instances WHERE applicant_id = :applicantId', { applicantId: req.params.applicantId });
    const stepRecord = await first('SELECT id FROM workflow_step_records WHERE instance_id = :instanceId AND step_code = :stepCode', {
      instanceId: instance.id,
      stepCode: req.params.stepCode,
    });
    await query(
      `UPDATE workflow_step_records
       SET status = :status,
           review_comment = :reviewComment,
           last_operator_id = :operatorId,
           operated_at = :operatedAt
       WHERE id = :id`,
      {
        status: req.body.status,
        reviewComment: req.body.comment || '',
        operatorId: req.user.id,
        operatedAt: now(),
        id: stepRecord.id,
      },
    );
    await logAudit('workflow_step_records', stepRecord.id, 'review_step', req.user.id, req.body);
    ok(res, true, '审核结果已保存');
  } catch (error) {
    fail(res, 500, error.message);
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

app.put('/api/workflow-steps/config/:stepCode', requireAuth(), async (req, res) => {
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

app.post('/api/orgs/assign-role', requireAuth(), async (req, res) => {
  try {
    const { userId, roleId } = req.body || {};
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
