const { query } = require('../db');
const { ok, fail } = require('../lib/http');
const { parseJson } = require('../lib/utils');
const { requireAuth } = require('../services/permission-service');
const { getApplicants, canAccessApplicant } = require('../services/applicant-service');
const { getApplicantProfileByUserId } = require('../services/profile-service');

function registerApplicantRoutes(app) {

  app.get('/api/users', requireAuth(), async (req, res) => {
    try {
      ok(
        res,
        await query(
          `SELECT u.id, u.username, u.name, o.name AS orgName, b.name AS branchName
           FROM users u
           LEFT JOIN org_units o ON o.id = u.org_id
           LEFT JOIN branches b ON b.id = u.branch_id
           ORDER BY u.username ASC`,
        ),
      );
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/applicants', requireAuth(), async (req, res) => {
    try {
      ok(res, await getApplicants(req.user, req.query || {}));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/applicants/:id', requireAuth(), async (req, res) => {
    try {
      if (!(await canAccessApplicant(req.user, req.params.id))) return fail(res, 403, '无权查看该申请人');
      const profile = await getApplicantProfileByUserId(req.params.id);
      ok(res, {
        ...parseJson(profile?.profileJson, {}),
        userId: profile?.userId,
        username: profile?.username,
        name: profile?.name,
        orgName: profile?.orgName,
        branchName: profile?.branchName,
        currentStage: profile?.currentStage,
        phone: profile?.phone,
        education: profile?.education,
        degree: profile?.degree,
        unitName: profile?.unitName,
        occupation: profile?.occupation,
      });
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerApplicantRoutes };
