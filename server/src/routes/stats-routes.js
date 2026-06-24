const { first, query } = require('../db');
const { ok, fail } = require('../lib/http');
const { requireAuth, hasPermission, scopeClause } = require('../services/permission-service');
const { getApplicants, listRegistrationRequests } = require('../services/applicant-service');
const { parseJson } = require('../lib/utils');
const { getStepDetail } = require('../workflow-config');

function applicantBrief(item) {
  return {
    id: item.id,
    name: item.name,
    username: item.username,
    grade: item.grade || String(item.username || '').slice(0, 4),
    branchName: item.branchName || '-',
  };
}

async function pendingReviewCount(user) {
  const scope = scopeClause(user, 'u');
  const rows = await query(
    `SELECT
        r.step_code AS stepCode,
        d.responsible_roles_json AS responsibleRolesJson,
        d.allowed_roles_json AS allowedRolesJson,
        d.requires_reviewer_action AS requiresReviewerAction,
        r.status
     FROM workflow_step_records r
     INNER JOIN workflow_instances i ON i.id = r.instance_id
     INNER JOIN workflow_step_definitions d ON d.step_code = r.step_code
     INNER JOIN users u ON u.id = i.applicant_id
     WHERE r.status IN ('pending', 'reviewing')
       AND r.step_code <> 'STEP_04'
     ${scope.sql}`,
    scope.params,
  );
  const roleIds = (user.roles || []).map((item) => item.id);
  return rows.filter((row) => {
    if (user.primaryRole === 'applicant') return row.status === 'reviewing';
    const responsibleRoles = parseJson(row.responsibleRolesJson || row.allowedRolesJson, []);
    const detail = getStepDetail(row.stepCode, responsibleRoles);
    if (!Number(detail.requiresReviewerAction ?? row.requiresReviewerAction ?? 0)) return false;
    if (!responsibleRoles.some((roleId) => roleIds.includes(roleId))) return false;
    if (detail.taskType === 'submit' && row.status === 'pending') return false;
    return true;
  }).length;
}

function registerStatsRoutes(app) {

  app.get('/api/stats/overview', requireAuth(), async (req, res) => {
    try {
      const isApplicant = req.user.primaryRole === 'applicant';
      const scope = scopeClause(req.user, 'u');
      const pendingReviews = await pendingReviewCount(req.user);
      const overdueRow = await first(
        `SELECT COUNT(DISTINCT i.applicant_id) AS count
         FROM workflow_step_records r
         INNER JOIN workflow_instances i ON i.id = r.instance_id
         INNER JOIN users u ON u.id = i.applicant_id
         WHERE r.status IN ('pending', 'reviewing', 'rejected')
           AND r.step_code <> 'STEP_04'
           AND r.deadline IS NOT NULL
           AND r.deadline < CURDATE()
           ${scope.sql}`,
        scope.params,
      );
      const overdueItems = overdueRow?.count || 0;

      if (isApplicant) {
        ok(res, {
          pendingReviews,
          overdueItems,
        });
        return;
      }

      const applicants = await getApplicants(req.user, {});
      const pendingRegistrations = hasPermission(req.user, 'approve_registration')
        ? await listRegistrationRequests(req.user, { status: 'pending' })
        : [];
      const stageMap = {};
      applicants.forEach((item) => {
        stageMap[item.currentStage] = (stageMap[item.currentStage] || 0) + 1;
      });
      ok(res, {
        totalApplicants: applicants.length,
        pendingRegistrations: pendingRegistrations.length,
        pendingReviews,
        overdueItems,
        stageDistribution: Object.entries(stageMap).map(([stage, count]) => ({
          stage,
          count,
          members: applicants.filter((item) => item.currentStage === stage).map(applicantBrief),
        })),
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
        const row = map.get(key) || { orgName: key, applicants: 0, developing: 0, formalMembers: 0, developmentRate: '0%' };
        row.applicants += 1;
        if (item.currentStage === '正式党员') row.formalMembers += 1;
        else row.developing += 1;
        row.developmentRate = row.applicants ? `${Math.round((row.developing / row.applicants) * 100)}%` : '0%';
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
        const row = map.get(key) || { branchName: key, applicants: 0, developing: 0, formalMembers: 0, developmentRate: '0%' };
        row.applicants += 1;
        if (item.currentStage === '正式党员') row.formalMembers += 1;
        else row.developing += 1;
        row.developmentRate = row.applicants ? `${Math.round((row.developing / row.applicants) * 100)}%` : '0%';
        map.set(key, row);
      });
      ok(res, Array.from(map.values()));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerStatsRoutes };
