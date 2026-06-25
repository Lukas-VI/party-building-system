const { query } = require('../db');
const { ok, fail } = require('../lib/http');
const { requireAuth, scopeClause } = require('../services/permission-service');
const { parseJson } = require('../lib/utils');
const { getStepDetail } = require('../workflow-config');

function registerReviewRoutes(app) {

  app.get('/api/reviews/pending', requireAuth(), async (req, res) => {
    try {
      const scope = scopeClause(req.user, 'u');
      const rows = await query(
        `SELECT
              i.applicant_id AS applicantId,
              r.step_code AS stepCode,
              d.sort_order AS sortOrder,
              d.name AS stepName,
              d.responsible_roles_json AS responsibleRolesJson,
              d.allowed_roles_json AS allowedRolesJson,
              d.requires_reviewer_action AS requiresReviewerAction,
              d.material_schema_json AS materialSchemaJson,
              r.status,
              r.deadline,
              u.name AS applicantName,
              u.username AS applicantUsername,
              o.name AS orgName,
              b.name AS branchName
           FROM workflow_step_records r
           INNER JOIN workflow_instances i ON i.id = r.instance_id
           INNER JOIN workflow_step_definitions d ON d.step_code = r.step_code
           INNER JOIN users u ON u.id = i.applicant_id
           LEFT JOIN org_units o ON o.id = u.org_id
           LEFT JOIN branches b ON b.id = u.branch_id
           WHERE r.status IN ('pending', 'reviewing')
           ${scope.sql}
           ORDER BY r.deadline ASC, d.sort_order ASC`,
        scope.params,
      );
      const roleIds = (req.user.roles || []).map((item) => item.id);
      ok(
        res,
        rows
          .filter((row) => {
            const responsibleRoles = parseJson(row.responsibleRolesJson || row.allowedRolesJson, []);
            const detail = getStepDetail(row.stepCode, responsibleRoles);
            if (!Number(detail.requiresReviewerAction ?? row.requiresReviewerAction ?? 0)) return false;
            if (!responsibleRoles.some((roleId) => roleIds.includes(roleId))) return false;
            if (detail.taskType === 'submit' && row.status === 'pending') return false;
            return true;
          })
          .map(({ responsibleRolesJson, allowedRolesJson, requiresReviewerAction, materialSchemaJson, ...row }) => {
            const responsibleRoles = parseJson(responsibleRolesJson || allowedRolesJson, []);
            const detail = getStepDetail(row.stepCode, responsibleRoles);
            return {
              ...row,
              taskType: detail.taskType || 'notice',
              businessFields: detail.businessFields || [],
            };
          }),
      );
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerReviewRoutes };
