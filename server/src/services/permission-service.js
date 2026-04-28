const { fail } = require('../lib/http');
const { errorWithStatus } = require('../lib/utils');
const { getUserWithAuth, verifyToken } = require('./auth-service');

function roleScopeLabel(user) {
  if (user.primaryRole === 'applicant') return '本人数据';
  if (user.primaryRole === 'branchSecretary') return '本支部数据';
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) return '本单位数据';
  return '全校数据';
}

function requireAuth() {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) return fail(res, 401, '未登录');
      const decoded = verifyToken(token);
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

function canAccessScopedRecord(user, record) {
  if (user.primaryRole === 'applicant') return user.id === record.id || user.id === record.userId;
  if (user.primaryRole === 'branchSecretary') return Boolean(user.branchId && user.branchId === record.branchId);
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) return Boolean(user.orgId && user.orgId === record.orgId);
  return true;
}

async function assertCanAccessApplicant(user, applicantId) {
  const { canAccessApplicant } = require('./applicant-service');
  if (!(await canAccessApplicant(user, applicantId))) {
    throw errorWithStatus('无权访问该申请人', 403);
  }
}

module.exports = {
  roleScopeLabel,
  requireAuth,
  hasPermission,
  requirePermission,
  scopeClause,
  canAccessScopedRecord,
  assertCanAccessApplicant,
};
