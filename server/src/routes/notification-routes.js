const { ok, fail } = require('../lib/http');
const { requireAuth, hasPermission } = require('../services/permission-service');
const { logAudit } = require('../services/audit-service');
const { listNotificationRecipients, sendCustomNotification } = require('../services/notification-service');

function canSendNotifications(user) {
  return hasPermission(user, 'review_steps') || hasPermission(user, 'manage_orgs') || hasPermission(user, 'approve_registration');
}

function requireNotificationSender(req, res, next) {
  if (!canSendNotifications(req.user)) return fail(res, 403, '无权发送通知');
  return next();
}

function registerNotificationRoutes(app) {
  app.get('/api/notifications/recipients', requireAuth(), requireNotificationSender, async (req, res) => {
    try {
      ok(res, await listNotificationRecipients(req.user, req.query || {}));
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/notifications/custom', requireAuth(), requireNotificationSender, async (req, res) => {
    try {
      const result = await sendCustomNotification(req.user, req.body || {});
      await logAudit('notifications', 'custom', 'send_custom_notification', req.user.id, {
        title: req.body?.title,
        recipientCount: result.sent,
        relatedStepCode: req.body?.relatedStepCode || null,
        relatedTargetId: req.body?.relatedTargetId || null,
      });
      ok(res, result, `通知已发送 ${result.sent} 人`);
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });
}

module.exports = { registerNotificationRoutes };
