/**
 * Review queue route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerReviewRoutes(app, ctx) {
  const {
    query,
    ok,
    fail,
    requireAuth,
    scopeClause,
  } = ctx;

  app.get('/api/reviews/pending', requireAuth(), async (req, res) => {
    try {
      const scope = scopeClause(req.user, 'u');
      ok(
        res,
        await query(
          `SELECT
              i.applicant_id AS applicantId,
              r.step_code AS stepCode,
              d.name AS stepName,
              r.status,
              r.deadline,
              u.name AS applicantName,
              o.name AS orgName,
              b.name AS branchName
           FROM workflow_step_records r
           INNER JOIN workflow_instances i ON i.id = r.instance_id
           INNER JOIN workflow_step_definitions d ON d.step_code = r.step_code
           INNER JOIN users u ON u.id = i.applicant_id
           LEFT JOIN org_units o ON o.id = u.org_id
           LEFT JOIN branches b ON b.id = u.branch_id
           WHERE r.status = 'reviewing'
           ${scope.sql}
           ORDER BY r.deadline ASC, d.sort_order ASC`,
          scope.params,
        ),
      );
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerReviewRoutes };
