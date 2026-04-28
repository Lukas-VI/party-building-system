const { query, first } = require('../db');
const { now, errorWithStatus } = require('../lib/utils');
const { logAudit } = require('./audit-service');

async function ensureSystemSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(128) PRIMARY KEY,
      setting_value TEXT NULL,
      description VARCHAR(255) NULL,
      updated_by VARCHAR(64) NULL,
      updated_at DATETIME NOT NULL
    )
  `);
}

async function getSystemSetting(settingKey, fallbackValue = '') {
  await ensureSystemSettingsTable();
  const row = await first(
    `SELECT setting_value AS settingValue
     FROM system_settings
     WHERE setting_key = :settingKey`,
    { settingKey },
  );
  return row ? row.settingValue : fallbackValue;
}

async function setSystemSetting(settingKey, settingValue, description = '', operatorId = null) {
  await ensureSystemSettingsTable();
  await query(
    `INSERT INTO system_settings
      (setting_key, setting_value, description, updated_by, updated_at)
     VALUES (:settingKey, :settingValue, :description, :operatorId, :updatedAt)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       description = VALUES(description),
       updated_by = VALUES(updated_by),
       updated_at = VALUES(updated_at)`,
    { settingKey, settingValue, description, operatorId, updatedAt: now() },
  );
}

async function getWorkflowSettings() {
  const enforceTimeLimit = await getSystemSetting('workflow.enforceTimeLimit', 'false');
  return {
    enforceTimeLimit: enforceTimeLimit === 'true',
  };
}

async function updateWorkflowSettings(user, payload = {}) {
  if (user.primaryRole !== 'superAdmin') {
    throw errorWithStatus('仅超级管理员可修改流程调试开关', 403);
  }
  const enabled = Boolean(payload.enforceTimeLimit);
  await setSystemSetting(
    'workflow.enforceTimeLimit',
    enabled ? 'true' : 'false',
    '是否启用流程节点开始/截止时间校验；默认关闭以便联调。',
    user.id,
  );
  await logAudit('system_settings', 'workflow.enforceTimeLimit', 'update_workflow_settings', user.id, { enforceTimeLimit: enabled });
  return getWorkflowSettings();
}

module.exports = {
  ensureSystemSettingsTable,
  getSystemSetting,
  setSystemSetting,
  getWorkflowSettings,
  updateWorkflowSettings,
};
