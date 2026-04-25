/**
 * Authentication route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerAuthRoutes(app, ctx) {
  const {
    query,
    first,
    ok,
    fail,
    now,
    hashPassword,
    verifyPassword,
    needsPasswordRehash,
    signToken,
    logAudit,
    getUserWithAuth,
    requireAuth,
    requirePermission,
    canAccessScopedRecord,
    ALLOWED_REVIEW_STATUSES,
  } = ctx;

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const userRow = await first('SELECT id, username, password_hash AS passwordHash, status FROM users WHERE username = :username', { username });
      if (!userRow || !verifyPassword(password, userRow.passwordHash)) return fail(res, 401, '账号或密码错误');
      if (userRow.status !== 'active') return fail(res, 403, '账号未激活');
      if (needsPasswordRehash(userRow.passwordHash)) {
        await query(
          'UPDATE users SET password_hash = :passwordHash WHERE id = :userId',
          {
            userId: userRow.id,
            passwordHash: hashPassword(password),
          },
        );
      }
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
      const normalizedName = String(name || '').trim();
      const normalizedIdNo = String(idNo || '').trim().toUpperCase();
      const normalizedEmployeeNo = String(employeeNo || '').trim();
      const normalizedPassword = String(password || '');

      if (!normalizedName) return fail(res, 400, '请输入姓名');
      if (!normalizedEmployeeNo) return fail(res, 400, '请输入学号或工号');
      if (!normalizedIdNo) return fail(res, 400, '请输入身份证号');
      if (!/^\d{17}[\dX]$/.test(normalizedIdNo)) return fail(res, 400, '身份证号格式不正确');
      if (!normalizedPassword || normalizedPassword.length < 8) return fail(res, 400, '密码至少 8 位');

      const birthYear = Number(normalizedIdNo.slice(6, 10));
      const age = ctx.ageFromIdNo(normalizedIdNo);
      if (!birthYear || age === null) return fail(res, 400, '身份证号格式不正确');
      if (age < 18) return fail(res, 400, '未满18周岁，不能提交入党申请');

      const user = await first(
        'SELECT id, name, status FROM users WHERE username = :employeeNo',
        { employeeNo: normalizedEmployeeNo },
      );
      if (!user) return fail(res, 400, '后台未找到预置人员信息');
      if (user.name !== normalizedName) return fail(res, 400, '姓名与预置人员信息不一致');
      if (user.status === 'active') return fail(res, 400, '账号已激活，请直接登录');

      const pendingRequest = await first(
        `SELECT request_no AS requestNo
         FROM registration_requests
         WHERE user_id = :userId AND status = 'pending'
         ORDER BY id DESC
         LIMIT 1`,
        { userId: user.id },
      );
      if (pendingRequest) return fail(res, 400, '已有待审核注册申请，请勿重复提交');

      await query(
        `INSERT INTO registration_requests (request_no, user_id, name, id_no, employee_no, status, created_at)
         VALUES (:requestNo, :userId, :name, :idNo, :employeeNo, 'pending', :createdAt)`,
        {
          requestNo: `REG${Date.now()}`,
          userId: user.id,
          name: normalizedName,
          idNo: normalizedIdNo,
          employeeNo: normalizedEmployeeNo,
          createdAt: now(),
        },
      );
      await query('UPDATE users SET password_hash = :passwordHash WHERE id = :userId', {
        passwordHash: hashPassword(normalizedPassword),
        userId: user.id,
      });
      await logAudit('registration_requests', normalizedEmployeeNo, 'submit_registration', user.id, {
        employeeNo: normalizedEmployeeNo,
        age,
      });
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
}

module.exports = { registerAuthRoutes };
