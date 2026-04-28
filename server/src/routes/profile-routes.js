const { query } = require('../db');
const { ok, fail } = require('../lib/http');
const { now } = require('../lib/utils');
const { logAudit } = require('../services/audit-service');
const { requireAuth } = require('../services/permission-service');
const { getProfileViewByUser, upsertUserProfile } = require('../services/profile-service');
const { dashboardForUser } = require('../services/mobile-workbench-service');

function registerProfileRoutes(app) {

  app.get('/api/dashboard/me', requireAuth(), async (req, res) => {
    try {
      ok(res, await dashboardForUser(req.user));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/profile/me', requireAuth(), async (req, res) => {
    try {
      ok(res, await getProfileViewByUser(req.user));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.put('/api/profile/me', requireAuth(), async (req, res) => {
    try {
      const payload = req.body || {};
      await upsertUserProfile(req.user, payload);
      if (req.user.primaryRole === 'applicant') {
        await query(
          `UPDATE applicant_profiles
           SET phone = :phone,
               education = :education,
               degree = :degree,
               unit_name = :unitName,
               occupation = :occupation,
               profile_json = :profileJson,
               updated_at = :updatedAt
           WHERE user_id = :userId`,
          {
            phone: payload.phone || '',
            education: payload.education || '',
            degree: payload.degree || '',
            unitName: payload.unitName || '',
            occupation: payload.occupation || '',
            profileJson: JSON.stringify(payload),
            updatedAt: now(),
            userId: req.user.id,
          },
        );
        await logAudit('applicant_profiles', req.user.id, 'update_profile', req.user.id, payload);
      } else {
        await logAudit('user_profiles', req.user.id, 'update_profile', req.user.id, payload);
      }
      ok(res, true, '资料已保存');
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerProfileRoutes };
