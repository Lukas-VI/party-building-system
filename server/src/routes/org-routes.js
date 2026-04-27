const fs = require('node:fs');
const crypto = require('node:crypto');
const XLSX = require('xlsx');

/**
 * Organization and role route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function cell(row, aliases) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function normalizeStatus(value) {
  if (['active', '已激活', '启用'].includes(value)) return 'active';
  if (['pending', '待审核'].includes(value)) return 'pending';
  return 'inactive';
}

function roleIdFromValue(value) {
  const roleMap = {
    applicant: 'applicant',
    入党申请人: 'applicant',
    branchSecretary: 'branchSecretary',
    党支部书记: 'branchSecretary',
    organizer: 'organizer',
    组织员: 'organizer',
    secretary: 'secretary',
    '二级单位党委/总支书记': 'secretary',
    deputySecretary: 'deputySecretary',
    '二级单位党委/总支副书记': 'deputySecretary',
    orgDept: 'orgDept',
    校党委组织部人员: 'orgDept',
    superAdmin: 'superAdmin',
    超级管理员: 'superAdmin',
  };
  return roleMap[value] || '';
}

async function resolveOrgBranch(query, { orgId = '', branchId = '' }) {
  const org = orgId ? await query('SELECT id, name FROM org_units WHERE id = :orgId OR name = :orgId LIMIT 1', { orgId }) : null;
  const branch = branchId ? await query('SELECT id, name, org_id AS orgId FROM branches WHERE id = :branchId OR name = :branchId LIMIT 1', { branchId }) : null;
  return {
    org: org?.[0] || null,
    branch: branch?.[0] || null,
  };
}

function registerOrgRoutes(app, ctx) {
  const {
    query,
    first,
    ok,
    fail,
    now,
    hashPassword,
    logAudit,
    requireAuth,
    requirePermission,
    canAccessScopedRecord,
    HIGH_PRIVILEGE_ROLES,
    upload,
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

  app.get('/api/orgs/staff', requireAuth(), requirePermission('manage_orgs'), async (req, res) => {
    try {
      const { keyword = '', orgId = '', branchId = '', status = '' } = req.query || {};
      const where = [];
      const params = {};
      if (keyword) {
        where.push('(u.username LIKE :keyword OR u.name LIKE :keyword OR o.name LIKE :keyword OR b.name LIKE :keyword)');
        params.keyword = `%${keyword}%`;
      }
      if (orgId) {
        where.push('u.org_id = :orgId');
        params.orgId = orgId;
      }
      if (branchId) {
        where.push('u.branch_id = :branchId');
        params.branchId = branchId;
      }
      if (status) {
        where.push('u.status = :status');
        params.status = status;
      }
      const rows = await query(
        `SELECT
            u.id,
            u.username,
            u.name,
            u.status,
            u.org_id AS orgId,
            u.branch_id AS branchId,
            o.name AS orgName,
            b.name AS branchName,
            GROUP_CONCAT(r.label ORDER BY r.label SEPARATOR ' / ') AS roleLabels
         FROM users u
         LEFT JOIN org_units o ON o.id = u.org_id
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         GROUP BY u.id, u.username, u.name, u.status, u.org_id, u.branch_id, o.name, b.name
         ORDER BY u.username ASC`,
        params,
      );
      ok(res, rows);
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.post('/api/orgs/staff', requireAuth(), requirePermission('manage_orgs'), async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim();
      const name = String(req.body?.name || '').trim();
      const status = normalizeStatus(String(req.body?.status || '').trim());
      const roleId = roleIdFromValue(String(req.body?.roleId || '').trim());
      const { org, branch } = await resolveOrgBranch(query, {
        orgId: String(req.body?.orgId || '').trim(),
        branchId: String(req.body?.branchId || '').trim(),
      });
      if (!username) return fail(res, 400, '请输入学号或工号');
      if (!name) return fail(res, 400, '请输入姓名');
      if (req.body?.orgId && !org) return fail(res, 400, '未找到所选单位');
      if (req.body?.branchId && !branch) return fail(res, 400, '未找到所选支部');
      if (branch && org && branch.orgId !== org.id) return fail(res, 400, '支部不属于所选单位');
      if (roleId && HIGH_PRIVILEGE_ROLES.has(roleId) && req.user.primaryRole !== 'superAdmin') return fail(res, 403, '无权分配高权限角色');
      const existing = await first('SELECT id FROM users WHERE username = :username', { username });
      if (existing) return fail(res, 400, '该学号/工号已存在');
      const userId = `u-${crypto.randomUUID()}`;
      await query(
        `INSERT INTO users (id, username, password_hash, name, status, org_id, branch_id, created_at)
         VALUES (:id, :username, :passwordHash, :name, :status, :orgId, :branchId, :createdAt)`,
        {
          id: userId,
          username,
          passwordHash: hashPassword('ChangeMe123!'),
          name,
          status,
          orgId: org?.id || branch?.orgId || null,
          branchId: branch?.id || null,
          createdAt: now(),
        },
      );
      if (roleId) await query('INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)', { userId, roleId });
      await logAudit('users', userId, 'create_staff', req.user.id, { username, name, status, roleId });
      ok(res, { id: userId }, '人员已新增');
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.put('/api/orgs/staff/:id', requireAuth(), requirePermission('manage_orgs'), async (req, res) => {
    try {
      const target = await first('SELECT id FROM users WHERE id = :id', { id: req.params.id });
      if (!target) return fail(res, 404, '未找到人员');
      const name = String(req.body?.name || '').trim();
      const status = normalizeStatus(String(req.body?.status || '').trim());
      const roleId = roleIdFromValue(String(req.body?.roleId || '').trim());
      const { org, branch } = await resolveOrgBranch(query, {
        orgId: String(req.body?.orgId || '').trim(),
        branchId: String(req.body?.branchId || '').trim(),
      });
      if (!name) return fail(res, 400, '请输入姓名');
      if (req.body?.orgId && !org) return fail(res, 400, '未找到所选单位');
      if (req.body?.branchId && !branch) return fail(res, 400, '未找到所选支部');
      if (branch && org && branch.orgId !== org.id) return fail(res, 400, '支部不属于所选单位');
      if (roleId && HIGH_PRIVILEGE_ROLES.has(roleId) && req.user.primaryRole !== 'superAdmin') return fail(res, 403, '无权分配高权限角色');
      await query(
        `UPDATE users
         SET name = :name,
             status = :status,
             org_id = :orgId,
             branch_id = :branchId
         WHERE id = :id`,
        {
          id: req.params.id,
          name,
          status,
          orgId: org?.id || branch?.orgId || null,
          branchId: branch?.id || null,
        },
      );
      if (roleId) {
        const currentRole = await first('SELECT id FROM user_roles WHERE user_id = :userId AND role_id = :roleId', { userId: req.params.id, roleId });
        if (!currentRole) await query('INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)', { userId: req.params.id, roleId });
      }
      await logAudit('users', req.params.id, 'update_staff', req.user.id, { name, status, roleId });
      ok(res, true, '人员已保存');
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.post('/api/orgs/import-staff', requireAuth(), requirePermission('manage_orgs'), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return fail(res, 400, '请上传人员表格');
      const workbook = XLSX.readFile(req.file.path, { cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      if (!rows.length) return fail(res, 400, '表格中没有可导入的数据');

      const orgRows = await query('SELECT id, name FROM org_units');
      const branchRows = await query('SELECT id, name, org_id AS orgId FROM branches');
      const orgById = new Map(orgRows.map((item) => [item.id, item]));
      const orgByName = new Map(orgRows.map((item) => [item.name, item]));
      const branchById = new Map(branchRows.map((item) => [item.id, item]));
      const branchByName = new Map(branchRows.map((item) => [item.name, item]));

      let imported = 0;
      let updated = 0;
      const errors = [];
      for (const [index, row] of rows.entries()) {
        const rowNo = index + 2;
        const username = cell(row, ['学号/工号', '学号', '工号', '学工号', '账号', 'username', 'employeeNo']);
        const name = cell(row, ['姓名', 'name']);
        const orgValue = cell(row, ['单位ID', '单位id', 'orgId', '所属单位ID', '单位', '所属单位']);
        const branchValue = cell(row, ['支部ID', '支部id', 'branchId', '所属支部ID', '支部', '所属支部']);
        const status = normalizeStatus(cell(row, ['状态', 'status']));
        const roleId = roleIdFromValue(cell(row, ['角色', 'role', '角色ID', 'roleId']));

        if (!username || !name) {
          errors.push({ row: rowNo, message: '缺少学号/工号或姓名' });
          continue;
        }
        const org = orgById.get(orgValue) || orgByName.get(orgValue) || null;
        const branch = branchById.get(branchValue) || branchByName.get(branchValue) || null;
        if (orgValue && !org) {
          errors.push({ row: rowNo, username, message: `未找到单位：${orgValue}` });
          continue;
        }
        if (branchValue && !branch) {
          errors.push({ row: rowNo, username, message: `未找到支部：${branchValue}` });
          continue;
        }
        if (branch && org && branch.orgId !== org.id) {
          errors.push({ row: rowNo, username, message: '支部不属于所填单位' });
          continue;
        }
        if (roleId && HIGH_PRIVILEGE_ROLES.has(roleId) && req.user.primaryRole !== 'superAdmin') {
          errors.push({ row: rowNo, username, message: '无权导入高权限角色' });
          continue;
        }

        const userId = `u-${crypto.randomUUID()}`;
        const existing = await first('SELECT id FROM users WHERE username = :username', { username });
        if (existing) {
          await query(
            `UPDATE users
             SET name = :name,
                 status = :status,
                 org_id = :orgId,
                 branch_id = :branchId
             WHERE id = :id`,
            {
              id: existing.id,
              name,
              status,
              orgId: org?.id || branch?.orgId || null,
              branchId: branch?.id || null,
            },
          );
          updated += 1;
          if (roleId) {
            const currentRole = await first('SELECT id FROM user_roles WHERE user_id = :userId AND role_id = :roleId', {
              userId: existing.id,
              roleId,
            });
            if (!currentRole) await query('INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)', { userId: existing.id, roleId });
          }
          continue;
        }

        await query(
          `INSERT INTO users (id, username, password_hash, name, status, org_id, branch_id, created_at)
           VALUES (:id, :username, :passwordHash, :name, :status, :orgId, :branchId, :createdAt)`,
          {
            id: userId,
            username,
            passwordHash: hashPassword('ChangeMe123!'),
            name,
            status,
            orgId: org?.id || branch?.orgId || null,
            branchId: branch?.id || null,
            createdAt: now(),
          },
        );
        if (roleId) await query('INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)', { userId, roleId });
        imported += 1;
      }

      await logAudit('staff_import', 'batch', 'import_staff', req.user.id, { imported, updated, errors: errors.slice(0, 20) });
      ok(res, { imported, updated, failed: errors.length, errors: errors.slice(0, 20) }, '人员表格导入完成');
    } catch (error) {
      fail(res, 500, error.message);
    } finally {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
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
