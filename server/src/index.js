const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const { all, get, run, enrichUser } = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

const menuMap = {
  view_dashboard: 'dashboard',
  view_applicants: 'applicants',
  review_steps: 'reviews',
  manage_orgs: 'organizations',
  view_org_stats: 'analytics',
  export_branch: 'exports',
  export_org: 'exports',
  export_all: 'exports',
  configure_workflow: 'workflowConfig',
};

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsDir));

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function recordAudit(targetType, targetId, action, operatorId, detail) {
  run(
    'INSERT INTO audit_logs (target_type, target_id, action, operator_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [targetType, String(targetId), action, operatorId, JSON.stringify(detail || {}), now()],
  );
}

function authRequired(req, res, next) {
  const token = req.headers['x-demo-user-id'] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ message: '未登录' });
    return;
  }
  const user = enrichUser(token);
  if (!user) {
    res.status(401).json({ message: '用户不存在' });
    return;
  }
  req.user = user;
  next();
}

function getPrimaryRole(user) {
  return user.roles[0]?.id || 'applicant';
}

function getMenus(user) {
  const menuSet = new Set();
  user.permissions.forEach((permission) => {
    const key = menuMap[permission.id];
    if (key) menuSet.add(key);
  });
  return Array.from(menuSet);
}

function scopeApplicantFilters(user) {
  const role = getPrimaryRole(user);
  if (role === 'branchSecretary') return { branchId: user.branchId };
  if (['secretary', 'deputySecretary', 'organizer'].includes(role)) return { orgId: user.orgId };
  if (role === 'applicant') return { applicantId: user.id };
  return {};
}

function fetchApplicants(user, filters = {}) {
  const scope = scopeApplicantFilters(user);
  const rows = all(
    `SELECT
      u.id,
      u.username,
      u.name,
      u.status,
      ap.current_stage AS currentStage,
      ap.phone,
      ap.unit_name AS unitName,
      ap.occupation,
      o.name AS orgName,
      b.name AS branchName
    FROM applicant_profiles ap
    INNER JOIN users u ON u.id = ap.user_id
    LEFT JOIN org_units o ON o.id = u.org_id
    LEFT JOIN branches b ON b.id = u.branch_id`,
  );
  return rows.filter((row) => {
    if (scope.applicantId && row.id !== scope.applicantId) return false;
    if (scope.orgId && getUserScopeOrg(row.id) !== scope.orgId) return false;
    if (scope.branchId && getUserScopeBranch(row.id) !== scope.branchId) return false;
    if (filters.orgId && getUserScopeOrg(row.id) !== filters.orgId) return false;
    if (filters.branchId && getUserScopeBranch(row.id) !== filters.branchId) return false;
    if (filters.stage && row.currentStage !== filters.stage) return false;
    if (filters.keyword && !`${row.name}${row.username}${row.unitName}`.includes(filters.keyword)) return false;
    return true;
  });
}

function getUserScopeOrg(userId) {
  const row = get('SELECT org_id AS orgId FROM users WHERE id = ?', [userId]);
  return row?.orgId || '';
}

function getUserScopeBranch(userId) {
  const row = get('SELECT branch_id AS branchId FROM users WHERE id = ?', [userId]);
  return row?.branchId || '';
}

function fetchWorkflow(applicantId) {
  const instance = get('SELECT * FROM workflow_instances WHERE applicant_id = ?', [applicantId]);
  const steps = all(
    `SELECT
      r.id,
      r.step_code AS stepCode,
      d.name,
      d.phase,
      d.sort_order AS sortOrder,
      d.allowed_roles AS allowedRoles,
      d.form_schema AS formSchema,
      d.start_at AS startAt,
      d.end_at AS endAt,
      r.status,
      r.form_data AS formData,
      r.review_comment AS reviewComment,
      r.last_operator_id AS lastOperatorId,
      r.operated_at AS operatedAt,
      r.deadline
     FROM workflow_step_records r
     INNER JOIN workflow_step_definitions d ON d.step_code = r.step_code
     WHERE r.instance_id = ?
     ORDER BY d.sort_order`,
    [instance.id],
  ).map((item) => ({
    ...item,
    allowedRoles: JSON.parse(item.allowedRoles || '[]'),
    formSchema: JSON.parse(item.formSchema || '{}'),
    formData: JSON.parse(item.formData || '{}'),
  }));
  return { instance, steps };
}

function ensureWorkflowAccess(user, applicantId) {
  const scope = scopeApplicantFilters(user);
  if (scope.applicantId && scope.applicantId !== applicantId) return false;
  if (scope.orgId && getUserScopeOrg(applicantId) !== scope.orgId) return false;
  if (scope.branchId && getUserScopeBranch(applicantId) !== scope.branchId) return false;
  return true;
}

function statsOverview(user) {
  const applicants = fetchApplicants(user, {});
  const pendingRegistrations = all('SELECT COUNT(*) AS count FROM registration_requests WHERE status = ?', ['pending'])[0].count;
  const pendingReviews = all('SELECT COUNT(*) AS count FROM workflow_step_records WHERE status = ?', ['reviewing'])[0].count;
  const overdue = all('SELECT COUNT(*) AS count FROM workflow_step_records WHERE status IN (?, ?) AND deadline < ?', ['pending', 'reviewing', '2026-05-20'])[0].count;
  const byStage = {};
  applicants.forEach((item) => {
    byStage[item.currentStage] = (byStage[item.currentStage] || 0) + 1;
  });
  return {
    totalApplicants: applicants.length,
    pendingRegistrations,
    pendingReviews,
    overdueItems: overdue,
    stageDistribution: Object.entries(byStage).map(([stage, count]) => ({ stage, count })),
  };
}

function statsByOrg(user) {
  const applicants = fetchApplicants(user, {});
  const map = new Map();
  applicants.forEach((item) => {
    const key = item.orgName;
    const row = map.get(key) || { orgName: item.orgName, applicants: 0, pending: 0, reviewing: 0 };
    row.applicants += 1;
    if (item.currentStage === '入党申请人') row.pending += 1;
    if (['发展对象', '预备党员'].includes(item.currentStage)) row.reviewing += 1;
    map.set(key, row);
  });
  return Array.from(map.values());
}

function statsByBranch(user) {
  const applicants = fetchApplicants(user, {});
  const map = new Map();
  applicants.forEach((item) => {
    const key = item.branchName;
    const row = map.get(key) || { branchName: item.branchName, applicants: 0, activeSteps: 0 };
    row.applicants += 1;
    if (!['正式党员', '终止发展'].includes(item.currentStage)) row.activeSteps += 1;
    map.set(key, row);
  });
  return Array.from(map.values());
}

function sendWorkbook(res, sheets, fileName) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, data }) => {
    const sheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.end(buffer);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: now() });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = get('SELECT id FROM users WHERE username = ? AND password = ?', [username, password]);
  if (!row) {
    res.status(401).json({ message: '账号或密码错误' });
    return;
  }
  const user = enrichUser(row.id);
  res.json({
    token: user.id,
    user: {
      ...user,
      primaryRole: getPrimaryRole(user),
      menus: getMenus(user),
    },
  });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({
    user: {
      ...req.user,
      primaryRole: getPrimaryRole(req.user),
      menus: getMenus(req.user),
    },
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, idNo, employeeNo } = req.body || {};
  const user = get('SELECT id FROM users WHERE username = ?', [employeeNo]);
  if (!user) {
    res.status(400).json({ message: '后台未找到预置人员信息' });
    return;
  }
  const id = `reg-${Date.now()}`;
  run(
    'INSERT INTO registration_requests (id, user_id, name, id_no, employee_no, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, user.id, name, idNo, employeeNo, 'pending', now()],
  );
  recordAudit('registration', id, 'submit_registration', user.id, { name, employeeNo });
  res.json({ success: true, id });
});

app.post('/api/auth/approve-registration', authRequired, (req, res) => {
  const { requestId, status = 'approved' } = req.body || {};
  run('UPDATE registration_requests SET status = ? WHERE id = ?', [status, requestId]);
  recordAudit('registration', requestId, 'approve_registration', req.user.id, { status });
  res.json({ success: true });
});

app.get('/api/users', authRequired, (req, res) => {
  const rows = all(
    `SELECT u.id, u.username, u.name, o.name AS orgName, b.name AS branchName
     FROM users u
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     ORDER BY u.username`,
  );
  res.json({ data: rows });
});

app.get('/api/applicants', authRequired, (req, res) => {
  const data = fetchApplicants(req.user, req.query);
  res.json({ data });
});

app.get('/api/applicants/:id', authRequired, (req, res) => {
  if (!ensureWorkflowAccess(req.user, req.params.id)) {
    res.status(403).json({ message: '无权查看该申请人' });
    return;
  }
  const profile = get(
    `SELECT ap.*, u.name, u.username, o.name AS orgName, b.name AS branchName
     FROM applicant_profiles ap
     INNER JOIN users u ON u.id = ap.user_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE ap.user_id = ?`,
    [req.params.id],
  );
  res.json({ data: profile });
});

app.get('/api/workflows/:applicantId', authRequired, (req, res) => {
  if (!ensureWorkflowAccess(req.user, req.params.applicantId)) {
    res.status(403).json({ message: '无权查看该流程' });
    return;
  }
  res.json({ data: fetchWorkflow(req.params.applicantId) });
});

app.get('/api/workflow-steps/config', authRequired, (req, res) => {
  const data = all('SELECT step_code AS stepCode, sort_order AS sortOrder, name, phase, start_at AS startAt, end_at AS endAt FROM workflow_step_definitions ORDER BY sort_order');
  res.json({ data });
});

app.put('/api/workflow-steps/config/:stepCode', authRequired, (req, res) => {
  run('UPDATE workflow_step_definitions SET start_at = ?, end_at = ? WHERE step_code = ?', [req.body.startAt, req.body.endAt, req.params.stepCode]);
  recordAudit('workflow_step_definition', req.params.stepCode, 'update_step_config', req.user.id, req.body);
  res.json({ success: true });
});

app.post('/api/workflows/:applicantId/steps/:stepCode/submit', authRequired, (req, res) => {
  const instance = get('SELECT id FROM workflow_instances WHERE applicant_id = ?', [req.params.applicantId]);
  run(
    'UPDATE workflow_step_records SET status = ?, form_data = ?, last_operator_id = ?, operated_at = ? WHERE instance_id = ? AND step_code = ?',
    ['reviewing', JSON.stringify(req.body || {}), req.user.id, now(), instance.id, req.params.stepCode],
  );
  recordAudit('workflow_step_record', `${req.params.applicantId}-${req.params.stepCode}`, 'submit_step', req.user.id, req.body);
  res.json({ success: true });
});

app.post('/api/workflows/:applicantId/steps/:stepCode/review', authRequired, (req, res) => {
  const instance = get('SELECT id FROM workflow_instances WHERE applicant_id = ?', [req.params.applicantId]);
  run(
    'UPDATE workflow_step_records SET status = ?, review_comment = ?, last_operator_id = ?, operated_at = ? WHERE instance_id = ? AND step_code = ?',
    [req.body.status, req.body.comment || '', req.user.id, now(), instance.id, req.params.stepCode],
  );
  recordAudit('workflow_step_record', `${req.params.applicantId}-${req.params.stepCode}`, 'review_step', req.user.id, req.body);
  res.json({ success: true });
});

app.get('/api/reviews/pending', authRequired, (req, res) => {
  const data = all(
    `SELECT
      w.applicant_id AS applicantId,
      r.step_code AS stepCode,
      d.name AS stepName,
      r.status,
      u.name AS applicantName,
      o.name AS orgName,
      b.name AS branchName,
      r.deadline
     FROM workflow_step_records r
     INNER JOIN workflow_instances w ON w.id = r.instance_id
     INNER JOIN users u ON u.id = w.applicant_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     INNER JOIN workflow_step_definitions d ON d.step_code = r.step_code
     WHERE r.status = 'reviewing'
     ORDER BY r.deadline`,
  ).filter((item) => ensureWorkflowAccess(req.user, item.applicantId));
  res.json({ data });
});

app.post('/api/files/upload', authRequired, upload.single('file'), (req, res) => {
  res.json({
    data: {
      fileName: req.file.originalname,
      filePath: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
    },
  });
});

app.get('/api/orgs', authRequired, (req, res) => {
  res.json({ data: all('SELECT id, name FROM org_units ORDER BY name') });
});

app.get('/api/branches', authRequired, (req, res) => {
  res.json({ data: all('SELECT id, name, org_id AS orgId FROM branches ORDER BY name') });
});

app.post('/api/orgs/import-staff', authRequired, (req, res) => {
  recordAudit('import', 'staff', 'import_staff', req.user.id, { rows: req.body?.rows || 0 });
  res.json({ success: true, imported: req.body?.rows || 12 });
});

app.post('/api/orgs/assign-role', authRequired, (req, res) => {
  const { userId, roleId } = req.body || {};
  run('INSERT OR REPLACE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  recordAudit('user_role', userId, 'assign_role', req.user.id, { roleId });
  res.json({ success: true });
});

app.get('/api/stats/overview', authRequired, (req, res) => {
  res.json({ data: statsOverview(req.user) });
});

app.get('/api/stats/by-org', authRequired, (req, res) => {
  res.json({ data: statsByOrg(req.user) });
});

app.get('/api/stats/by-branch', authRequired, (req, res) => {
  res.json({ data: statsByBranch(req.user) });
});

app.get('/api/export/applicants', authRequired, (req, res) => {
  sendWorkbook(res, [{ name: '申请人台账', data: fetchApplicants(req.user, req.query) }], '申请人台账.xlsx');
});

app.get('/api/export/workflows', authRequired, (req, res) => {
  const rows = fetchApplicants(req.user, {}).flatMap((applicant) => {
    const workflow = fetchWorkflow(applicant.id);
    return workflow.steps.map((step) => ({
      applicantName: applicant.name,
      orgName: applicant.orgName,
      branchName: applicant.branchName,
      stepCode: step.stepCode,
      stepName: step.name,
      status: step.status,
      deadline: step.deadline,
    }));
  });
  sendWorkbook(res, [{ name: '流程台账', data: rows }], '流程台账.xlsx');
});

app.get('/api/export/stats', authRequired, (req, res) => {
  sendWorkbook(
    res,
    [
      { name: '单位统计', data: statsByOrg(req.user) },
      { name: '支部统计', data: statsByBranch(req.user) },
    ],
    '统计报表.xlsx',
  );
});

app.listen(port, () => {
  console.log(`dangjian demo server listening on http://127.0.0.1:${port}`);
});
