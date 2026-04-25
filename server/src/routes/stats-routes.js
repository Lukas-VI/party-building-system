/**
 * Statistics route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerStatsRoutes(app, ctx) {
  const {
    first,
    ok,
    fail,
    requireAuth,
    scopeClause,
    getApplicants,
  } = ctx;

  app.get('/api/stats/overview', requireAuth(), async (req, res) => {
    try {
      const applicants = await getApplicants(req.user, {});
      const pendingRegistrations = await first('SELECT COUNT(*) AS count FROM registration_requests WHERE status = :status', { status: 'pending' });
      const scope = scopeClause(req.user, 'u');
      const pendingReviews = await first(
        `SELECT COUNT(*) AS count
         FROM workflow_step_records r
         INNER JOIN workflow_instances i ON i.id = r.instance_id
         INNER JOIN users u ON u.id = i.applicant_id
         WHERE r.status = 'reviewing' ${scope.sql}`,
        scope.params,
      );
      const stageMap = {};
      applicants.forEach((item) => {
        stageMap[item.currentStage] = (stageMap[item.currentStage] || 0) + 1;
      });
      ok(res, {
        totalApplicants: applicants.length,
        pendingRegistrations: pendingRegistrations?.count || 0,
        pendingReviews: pendingReviews?.count || 0,
        overdueItems: 0,
        stageDistribution: Object.entries(stageMap).map(([stage, count]) => ({ stage, count })),
      });
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/stats/by-org', requireAuth(), async (req, res) => {
    try {
      const applicants = await getApplicants(req.user, {});
      const map = new Map();
      applicants.forEach((item) => {
        const key = item.orgName || '未分配单位';
        const row = map.get(key) || { orgName: key, applicants: 0, pending: 0, reviewing: 0 };
        row.applicants += 1;
        if (item.currentStage === '入党申请人') row.pending += 1;
        if (['发展对象', '预备党员'].includes(item.currentStage)) row.reviewing += 1;
        map.set(key, row);
      });
      ok(res, Array.from(map.values()));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/stats/by-branch', requireAuth(), async (req, res) => {
    try {
      const applicants = await getApplicants(req.user, {});
      const map = new Map();
      applicants.forEach((item) => {
        const key = item.branchName || '未分配支部';
        const row = map.get(key) || { branchName: key, applicants: 0, activeSteps: 0 };
        row.applicants += 1;
        if (!['正式党员', '终止发展'].includes(item.currentStage)) row.activeSteps += 1;
        map.set(key, row);
      });
      ok(res, Array.from(map.values()));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerStatsRoutes };
