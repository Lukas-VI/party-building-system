const jwt = require('jsonwebtoken');
const { env } = require('../env');
const { query, first } = require('../db');

function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username, role: user.primaryRole }, env.JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
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

async function buildPublicBootstrap() {
  return {
    loginHints: await listLoginHints(),
    defaultPasswordHint: env.TEST_DEFAULT_PASSWORD_HINT,
  };
}

module.exports = {
  signToken,
  verifyToken,
  buildMenus,
  getUserWithAuth,
  listLoginHints,
  buildPublicBootstrap,
};
