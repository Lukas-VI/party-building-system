const { query, first } = require('../db');
const { now, parseJson, errorWithStatus } = require('../lib/utils');

function configuredResponsibleRoles(step) {
  if (step.taskMeta?.responsibleRoles?.length) return step.taskMeta.responsibleRoles;
  if (step.responsibleRoles?.length) return step.responsibleRoles;
  return step.allowedRoles || [];
}

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

async function getUserScopeById(userId) {
  return first(
    `SELECT id, org_id AS orgId, branch_id AS branchId
     FROM users
     WHERE id = :userId`,
    { userId },
  );
}

function roleMatchesApplicantScope(candidate, applicant) {
  if (candidate.scopeLevel === 'all') return true;
  if (candidate.scopeLevel === 'org') return Boolean(candidate.orgId && candidate.orgId === applicant.orgId);
  if (candidate.scopeLevel === 'branch') return Boolean(candidate.branchId && candidate.branchId === applicant.branchId);
  if (candidate.scopeLevel === 'self') return candidate.id === applicant.id;
  return false;
}

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

module.exports = {
  listNotifications,
  normalizeNotification,
  getNotificationForUser,
  markNotificationRead,
  createNotification,
  getUserScopeById,
  roleMatchesApplicantScope,
  notificationRecipientsForStep,
};
