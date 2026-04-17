const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const seed = require('./seed');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, 'dangjian-demo.sqlite');
const db = new DatabaseSync(dbFile);

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function initSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      scope_level TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    );
    CREATE TABLE IF NOT EXISTS org_units (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      org_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      org_id TEXT,
      branch_id TEXT
    );
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id)
    );
    CREATE TABLE IF NOT EXISTS applicant_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      current_stage TEXT NOT NULL,
      phone TEXT,
      education TEXT,
      degree TEXT,
      unit_name TEXT,
      occupation TEXT,
      extra_json TEXT
    );
    CREATE TABLE IF NOT EXISTS registration_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      id_no TEXT NOT NULL,
      employee_no TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_instances (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL UNIQUE,
      current_stage TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_step_definitions (
      step_code TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      phase TEXT NOT NULL,
      allowed_roles TEXT NOT NULL,
      form_schema TEXT NOT NULL,
      start_at TEXT,
      end_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workflow_step_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT NOT NULL,
      step_code TEXT NOT NULL,
      status TEXT NOT NULL,
      form_data TEXT,
      review_comment TEXT,
      last_operator_id TEXT,
      operated_at TEXT,
      deadline TEXT
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_record_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      uploaded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      action TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function seedOnce() {
  const row = get('SELECT COUNT(*) AS count FROM users');
  if (row && row.count > 0) return;

  seed.permissions.forEach(([id, label]) => run('INSERT INTO permissions (id, label) VALUES (?, ?)', [id, label]));
  seed.roles.forEach(([id, label, scopeLevel, permissionIds]) => {
    run('INSERT INTO roles (id, label, scope_level) VALUES (?, ?, ?)', [id, label, scopeLevel]);
    permissionIds.forEach((permissionId) => {
      run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [id, permissionId]);
    });
  });
  seed.orgUnits.forEach(([id, name]) => run('INSERT INTO org_units (id, name) VALUES (?, ?)', [id, name]));
  seed.branches.forEach(([id, name, orgId]) => run('INSERT INTO branches (id, name, org_id) VALUES (?, ?, ?)', [id, name, orgId]));
  seed.users.forEach(([id, username, password, name, status, orgId, branchId]) => {
    run('INSERT INTO users (id, username, password, name, status, org_id, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, username, password, name, status, orgId, branchId]);
  });
  seed.userRoles.forEach(([userId, roleId]) => run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]));
  seed.profiles.forEach(([userId, currentStage, phone, education, degree, unitName, occupation]) => {
    run(
      'INSERT INTO applicant_profiles (user_id, current_stage, phone, education, degree, unit_name, occupation, extra_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, currentStage, phone, education, degree, unitName, occupation, JSON.stringify({})],
    );
    run(
      'INSERT INTO workflow_instances (id, applicant_id, current_stage, updated_at) VALUES (?, ?, ?, ?)',
      [`wf-${userId}`, userId, currentStage, '2026-04-17 10:00:00'],
    );
  });
  seed.registrationRequests.forEach(([id, userId, name, idNo, employeeNo, status, createdAt]) => {
    run(
      'INSERT INTO registration_requests (id, user_id, name, id_no, employee_no, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, name, idNo, employeeNo, status, createdAt],
    );
  });
  seed.stepDefinitions.forEach((definition) => {
    run(
      'INSERT INTO workflow_step_definitions (step_code, sort_order, name, phase, allowed_roles, form_schema, start_at, end_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        definition.stepCode,
        definition.sortOrder,
        definition.name,
        definition.phase,
        JSON.stringify(definition.allowedRoles),
        JSON.stringify(definition.formSchema),
        '2026-04-01',
        definition.sortOrder <= 10 ? '2026-05-31' : '2026-07-31',
      ],
    );
  });

  seed.profiles.forEach(([userId, currentStage]) => {
    const maxApproved = seed.stageProgress(currentStage);
    seed.stepDefinitions.forEach((definition, index) => {
      let status = 'locked';
      if (index + 1 < maxApproved) status = 'approved';
      if (index + 1 === maxApproved) status = currentStage === '正式党员' ? 'approved' : 'reviewing';
      if (index + 1 === maxApproved + 1) status = 'pending';
      run(
        'INSERT INTO workflow_step_records (instance_id, step_code, status, form_data, review_comment, last_operator_id, operated_at, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `wf-${userId}`,
          definition.stepCode,
          status,
          JSON.stringify({
            summary: status === 'approved' ? `${definition.name} 已完成` : '',
            note: status === 'reviewing' ? '等待上级审核' : '',
          }),
          status === 'approved' ? '审核通过' : '',
          status === 'approved' || status === 'reviewing' ? 'u-organizer-001' : null,
          status === 'approved' || status === 'reviewing' ? '2026-04-16 15:20:00' : null,
          definition.sortOrder <= 10 ? '2026-05-31' : '2026-07-31',
        ],
      );
    });
  });
}

function enrichUser(userId) {
  const user = get(
    `SELECT u.*, o.name AS org_name, b.name AS branch_name
     FROM users u
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = ?`,
    [userId],
  );
  if (!user) return null;
  const roles = all(
    `SELECT r.id, r.label, r.scope_level
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ?`,
    [userId],
  );
  const permissions = all(
    `SELECT DISTINCT p.id, p.label
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     INNER JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = ?`,
    [userId],
  );
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    status: user.status,
    orgId: user.org_id,
    orgName: user.org_name,
    branchId: user.branch_id,
    branchName: user.branch_name,
    roles,
    permissions,
  };
}

initSchema();
seedOnce();

module.exports = {
  db,
  run,
  all,
  get,
  enrichUser,
};
