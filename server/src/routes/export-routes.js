/**
 * Excel export route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerExportRoutes(app, ctx) {
  const {
    query,
    fail,
    requireAuth,
    getApplicants,
    getWorkflowByApplicantId,
    workbookBuffer,
  } = ctx;

  app.get('/api/export/applicants', requireAuth(), async (req, res) => {
    try {
      const buffer = workbookBuffer([{ name: '申请人台账', rows: await getApplicants(req.user, req.query || {}) }]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="applicants.xlsx"');
      res.end(buffer);
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/export/workflows', requireAuth(), async (req, res) => {
    try {
      const applicants = await getApplicants(req.user, {});
      const rows = [];
      for (const applicant of applicants) {
        const workflow = await getWorkflowByApplicantId(applicant.id);
        workflow.steps.forEach((step) => {
          rows.push({
            applicantName: applicant.name,
            orgName: applicant.orgName,
            branchName: applicant.branchName,
            stepCode: step.stepCode,
            stepName: step.name,
            status: step.status,
            deadline: step.deadline,
          });
        });
      }
      const buffer = workbookBuffer([{ name: '流程台账', rows }]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="workflows.xlsx"');
      res.end(buffer);
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/export/stats', requireAuth(), async (req, res) => {
    try {
      const applicants = await getApplicants(req.user, {});
      const orgMap = new Map();
      const branchMap = new Map();
      applicants.forEach((item) => {
        const orgKey = item.orgName || '未分配单位';
        const orgRow = orgMap.get(orgKey) || { orgName: orgKey, applicants: 0 };
        orgRow.applicants += 1;
        orgMap.set(orgKey, orgRow);
        const branchKey = item.branchName || '未分配支部';
        const branchRow = branchMap.get(branchKey) || { branchName: branchKey, applicants: 0 };
        branchRow.applicants += 1;
        branchMap.set(branchKey, branchRow);
      });
      const buffer = workbookBuffer([
        { name: '单位统计', rows: Array.from(orgMap.values()) },
        { name: '支部统计', rows: Array.from(branchMap.values()) },
      ]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="stats.xlsx"');
      res.end(buffer);
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerExportRoutes };
