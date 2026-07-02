const { query, first } = require('../db');
const { now, parseJson, errorWithStatus } = require('../lib/utils');
const { sendWechatWorkflowApprovalTemplate } = require('./wechat-template-service');
const { canAccessScopedRecord } = require('./permission-service');

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


function buildNotificationScope(user) {
  const primary = user.primaryRole || '';
  if (primary === 'applicant') {
    return { sql: 'WHERE n.user_id = :userId', params: { userId: user.id } };
  }
  if (primary === 'branchSecretary' && user.branchId) {
    return {
      sql: 'LEFT JOIN users scope_u ON n.user_id = scope_u.id WHERE scope_u.branch_id = :branchId',
      params: { branchId: user.branchId },
    };
  }
  if (['secretary', 'deputySecretary', 'organizer'].includes(primary) && user.orgId) {
    return {
      sql: 'LEFT JOIN users scope_u ON n.user_id = scope_u.id WHERE scope_u.org_id = :orgId',
      params: { orgId: user.orgId },
    };
  }
  return { sql: 'WHERE 1=1', params: {} };
}
function normalizeNotification(item) {
  const targetWorkflowId = item.relatedTargetType === 'workflow' ? String(item.relatedTargetId || '').replace(/^wf-/, '') : '';
  const targetRoute = targetWorkflowId
    ? `/workflow/${targetWorkflowId}/steps/${item.relatedStepCode || ''}?notificationId=${item.id}`
    : '';
  const statusTemplate = notificationStatusTemplate(item);
  return {
    ...item,
    isUnread: item.status === 'unread',
    targetWorkflowId,
    targetRoute,
    targetLabel: item.relatedStepCode ? `流程节点 ${item.relatedStepCode}` : '消息详情',
    statusLabel: statusTemplate.label,
    statusTone: statusTemplate.tone,
    hideTargetDetails: statusTemplate.hideTargetDetails,
    detailRows: buildNotificationDetailRows(item, statusTemplate),
  };
}

function notificationStatusTemplate(item) {
  const title = item.title || '';
  const content = item.content || '';
  if (item.type === 'task_reviewed' && /不通过|退回|驳回|补充/.test(`${title}${content}`)) {
    return { label: '未办理成功', tone: 'danger', hideTargetDetails: true };
  }
  if (item.type === 'task_reviewed' || item.type === 'next_step_opened') {
    return { label: '已办理成功', tone: 'success', hideTargetDetails: false };
  }
  if (item.status === 'unread') {
    return { label: '待查看', tone: 'danger', hideTargetDetails: false };
  }
  return { label: '已查看', tone: 'default', hideTargetDetails: false };
}

function buildNotificationDetailRows(item, statusTemplate) {
  const rows = [
    { label: '状态', value: statusTemplate.label, tone: statusTemplate.tone },
    { label: '时间', value: item.createdAt || '-' },
  ];
  if (!statusTemplate.hideTargetDetails && item.relatedStepCode) {
    rows.push({ label: '节点', value: item.relatedStepCode });
  }
  if (!statusTemplate.hideTargetDetails && item.relatedTargetType) {
    rows.push({ label: '关联', value: item.relatedTargetType === 'workflow' ? '流程消息' : item.relatedTargetType });
  }
  rows.push({ label: '说明', value: item.content || '-' });
  return rows;
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

async function createWorkflowNotification({
  userId,
  type,
  title,
  content,
  relatedStepCode,
  relatedTargetId,
  stepName,
  senderName,
} = {}) {
  const notificationId = await createNotification(
    userId,
    type,
    title,
    content,
    relatedStepCode,
    'workflow',
    relatedTargetId,
  );
  let templateMessage = null;
  if (relatedStepCode) {
    try {
      templateMessage = await sendWechatWorkflowApprovalTemplate({
        userId,
        stepCode: relatedStepCode,
        stepName,
        senderName,
        notificationId,
      });
    } catch (error) {
      console.warn('[wechat] workflow approval template failed:', error.message);
    }
  }
  return { notificationId, templateMessage };
}

async function listNotificationRecipients(user, { keyword = '', orgId = '', branchId = '', limit = 200 } = {}) {
  const where = ['u.status = \'active\''];
  const params = { limit: Math.min(Number(limit) || 200, 500) };
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
  const rows = await query(
    `SELECT
        u.id,
        u.username,
        u.name,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        o.name AS orgName,
        b.name AS branchName,
        GROUP_CONCAT(DISTINCT r.label ORDER BY r.label SEPARATOR '、') AS roleNames
     FROM users u
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE ${where.join(' AND ')}
     GROUP BY u.id, u.username, u.name, u.org_id, u.branch_id, o.name, b.name
     ORDER BY o.name ASC, b.name ASC, u.name ASC
     LIMIT ${params.limit}`,
    params,
  );
  return rows.filter((row) => canAccessScopedRecord(user, row));
}

async function sendCustomNotification(user, payload = {}) {
  const title = String(payload.title || '').trim();
  const content = String(payload.content || '').trim();
  const recipientUserIds = Array.from(new Set((payload.recipientUserIds || []).map((item) => String(item).trim()).filter(Boolean)));
  if (!title) throw errorWithStatus('请输入通知标题', 400);
  if (!content) throw errorWithStatus('请输入通知内容', 400);
  if (!recipientUserIds.length) throw errorWithStatus('请选择通知人员', 400);

  const allowedRecipients = await listNotificationRecipients(user, { limit: 500 });
  const allowedIds = new Set(allowedRecipients.map((item) => item.id));
  const targetIds = recipientUserIds.filter((userId) => allowedIds.has(userId));
  if (!targetIds.length) throw errorWithStatus('没有可通知的人员', 403);

  const results = [];
  for (const userId of targetIds) {
    const notificationId = await createNotification(
      userId,
      'custom_notice',
      title,
      `${user.name || '系统通知'}：${content}`,
      payload.relatedStepCode || null,
      'workflow',
      payload.relatedTargetId || null,
    );
    let templateMessage = null;
    try {
      templateMessage = await sendWechatWorkflowApprovalTemplate({
        userId,
        stepCode: payload.relatedStepCode || 'CUSTOM_NOTICE',
        stepName: payload.stepName || title,
        senderName: user.name || '系统通知',
        sentAt: now(),
        notificationId,
      });
    } catch (error) {
      console.warn('[wechat] workflow approval template failed:', error.message);
    }
    results.push({ notificationId, templateMessage });
  }
  return {
    requested: recipientUserIds.length,
    sent: results.length,
    skipped: recipientUserIds.length - results.length,
    results,
  };
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
  createWorkflowNotification,
  listNotificationRecipients,
  sendCustomNotification,
  getUserScopeById,
  roleMatchesApplicantScope,
  notificationRecipientsForStep,
};



