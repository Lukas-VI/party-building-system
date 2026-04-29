const { first, getPool } = require('../db');
const { ALLOWED_REVIEW_STATUSES } = require('../lib/constants');
const { now, errorWithStatus } = require('../lib/utils');
const { logAudit } = require('./audit-service');
const { ensureApplicantEnrollment } = require('./applicant-service');
const { canAccessScopedRecord } = require('./permission-service');

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
    throw errorWithStatus('未满18周岁，不能提交入党申请', 400);
  }
}

async function approveRegistrationRequest(reviewer, requestNo, status = 'approved') {
  if (!requestNo) throw errorWithStatus('缺少注册申请编号', 400);
  if (!ALLOWED_REVIEW_STATUSES.has(status)) throw errorWithStatus('注册审核状态不合法', 400);

  const connection = await getPool().getConnection();
  let request;
  let shouldEnsureEnrollment = false;
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT
          rr.request_no AS requestNo,
          rr.status,
          rr.user_id AS userId,
          u.id,
          u.status AS userStatus,
          u.org_id AS orgId,
          u.branch_id AS branchId
       FROM registration_requests rr
       INNER JOIN users u ON u.id = rr.user_id
       WHERE rr.request_no = ?
       FOR UPDATE`,
      [requestNo],
    );
    request = rows[0];
    if (!request) throw errorWithStatus('未找到注册申请', 404);
    if (!canAccessScopedRecord(reviewer, request)) throw errorWithStatus('无权审核该注册申请', 403);

    const canRepairApprovedInactive =
      status === 'approved' &&
      request.status === 'approved' &&
      request.userStatus !== 'active';
    const isIdempotentApproved =
      status === 'approved' &&
      request.status === 'approved' &&
      request.userStatus === 'active';
    if (request.status !== 'pending' && !canRepairApprovedInactive && !isIdempotentApproved) {
      throw errorWithStatus('该注册申请已处理', 400);
    }

    if (request.status === 'pending') {
      await connection.execute(
        'UPDATE registration_requests SET status = ?, reviewed_at = ? WHERE request_no = ?',
        [status, now(), requestNo],
      );
    }

    if (status === 'approved') {
      if (request.userStatus !== 'active') {
        await connection.execute('UPDATE users SET status = ? WHERE id = ?', ['active', request.userId]);
      }

      const [roleRows] = await connection.execute(
        'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1',
        [request.userId, 'applicant'],
      );
      if (!roleRows[0]) {
        await connection.execute(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
          [request.userId, 'applicant'],
        );
      }
      shouldEnsureEnrollment = true;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (shouldEnsureEnrollment) {
    await ensureApplicantEnrollment(request.userId);
  }

  await logAudit('registration_requests', requestNo, 'approve_registration', reviewer.id, { status });

  return {
    requestNo,
    status,
    userId: request.userId,
    userStatus: status === 'approved' ? 'active' : request.userStatus,
  };
}

module.exports = {
  ageFromIdNo,
  ensureAdultApplicant,
  approveRegistrationRequest,
};
