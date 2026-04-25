/**
 * Organization and role route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerOrgRoutes(app, ctx) {
  const {
    query,
    first,
    ok,
    fail,
    logAudit,
    requireAuth,
    requirePermission,
    canAccessScopedRecord,
    HIGH_PRIVILEGE_ROLES,
  } = ctx;

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
}

module.exports = { registerOrgRoutes };
