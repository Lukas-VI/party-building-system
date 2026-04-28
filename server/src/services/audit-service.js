const { query } = require('../db');
const { now } = require('../lib/utils');

async function logAudit(targetType, targetId, action, operatorId, detail = {}) {
  await query(
    `INSERT INTO audit_logs (target_type, target_id, action, operator_id, detail_json, created_at)
     VALUES (:targetType, :targetId, :action, :operatorId, :detailJson, :createdAt)`,
    {
      targetType,
      targetId: String(targetId),
      action,
      operatorId,
      detailJson: JSON.stringify(detail),
      createdAt: now(),
    },
  );
}

async function recentAuditLogs(user, limit = 8) {
  const rows = await query(
    `SELECT
        action,
        target_type AS targetType,
        target_id AS targetId,
        created_at AS createdAt,
        detail_json AS detailJson
     FROM audit_logs
     WHERE operator_id = :userId
     ORDER BY created_at DESC
     LIMIT ${Number(limit)}`,
    { userId: user.id },
  );
  const { parseJson } = require('../lib/utils');
  return rows.map((item) => ({
    ...item,
    detail: parseJson(item.detailJson, {}),
  }));
}

module.exports = {
  logAudit,
  recentAuditLogs,
};
