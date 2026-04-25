/**
 * PC workflow route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerWorkflowRoutes(app, ctx) {
  const {
    query,
    ok,
    fail,
    now,
    logAudit,
    requireAuth,
    requirePermission,
    canAccessApplicant,
    assertCanAccessApplicant,
    getWorkflowByApplicantId,
    assertWorkflowActor,
    nextTaskStatus,
    advanceAfterReview,
    ensureAdultApplicant,
    fileUrl,
    ALLOWED_REVIEW_STATUSES,
    upload,
  } = ctx;

  app.get('/api/workflows/me', requireAuth(), async (req, res) => {
    try {
      ok(res, await getWorkflowByApplicantId(req.user.id));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/workflows/:applicantId', requireAuth(), async (req, res) => {
    try {
      if (!(await canAccessApplicant(req.user, req.params.applicantId))) return fail(res, 403, '无权查看该流程');
      ok(res, await getWorkflowByApplicantId(req.params.applicantId));
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.post('/api/workflows/:applicantId/steps/:stepCode/submit', requireAuth(), async (req, res) => {
    try {
      await assertCanAccessApplicant(req.user, req.params.applicantId);
      const workflow = await getWorkflowByApplicantId(req.params.applicantId);
      const step = workflow.steps.find((item) => item.stepCode === req.params.stepCode);
      assertWorkflowActor(req.user, req.params.applicantId, workflow, step, 'submit');
      if (step.stepCode === 'STEP_01') {
        await ensureAdultApplicant(req.params.applicantId);
      }
      await query(
        `UPDATE workflow_step_records
         SET status = 'reviewing',
             task_status = 'in_review',
             form_data_json = :formDataJson,
             review_comment = :reviewComment,
             last_operator_id = :operatorId,
             operated_at = :operatedAt
         WHERE id = :id`,
        {
          formDataJson: JSON.stringify(req.body.formData || req.body || {}),
          reviewComment: req.body.reviewComment || '',
          operatorId: req.user.id,
          operatedAt: now(),
          id: step.id,
        },
      );
      await logAudit('workflow_step_records', step.id, 'submit_step', req.user.id, req.body);
      ok(res, true, '步骤已提交');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/workflows/:applicantId/steps/:stepCode/review', requireAuth(), async (req, res) => {
    try {
      await assertCanAccessApplicant(req.user, req.params.applicantId);
      const workflow = await getWorkflowByApplicantId(req.params.applicantId);
      const step = workflow.steps.find((item) => item.stepCode === req.params.stepCode);
      assertWorkflowActor(req.user, req.params.applicantId, workflow, step, 'review');
      const nextStatus = req.body.status || 'approved';
      if (!ALLOWED_REVIEW_STATUSES.has(nextStatus)) return fail(res, 400, '审核状态不合法');
      await query(
        `UPDATE workflow_step_records
         SET status = :status,
             task_status = :taskStatus,
             review_comment = :reviewComment,
             last_operator_id = :operatorId,
             operated_at = :operatedAt,
             confirmed_at = :confirmedAt
         WHERE id = :id`,
        {
          status: nextStatus,
          taskStatus: nextTaskStatus(nextStatus),
          reviewComment: req.body.comment || '',
          operatorId: req.user.id,
          operatedAt: now(),
          confirmedAt: nextStatus === 'approved' ? now() : null,
          id: step.id,
        },
      );
      await advanceAfterReview(workflow, step, nextStatus);
      await logAudit('workflow_step_records', step.id, 'review_step', req.user.id, req.body);
      ok(res, true, '审核结果已保存');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.get('/api/workflow-steps/config', requireAuth(), async (req, res) => {
    try {
      ok(
        res,
        await query(
          `SELECT step_code AS stepCode, sort_order AS sortOrder, name, phase, start_at AS startAt, end_at AS endAt
           FROM workflow_step_definitions
           ORDER BY sort_order ASC`,
        ),
      );
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.put('/api/workflow-steps/config/:stepCode', requireAuth(), requirePermission('configure_workflow'), async (req, res) => {
    try {
      await query(
        `UPDATE workflow_step_definitions
         SET start_at = :startAt, end_at = :endAt
         WHERE step_code = :stepCode`,
        {
          startAt: req.body.startAt,
          endAt: req.body.endAt,
          stepCode: req.params.stepCode,
        },
      );
      await logAudit('workflow_step_definitions', req.params.stepCode, 'update_step_config', req.user.id, req.body);
      ok(res, true, '流程配置已更新');
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.post('/api/files/upload', requireAuth(), upload.single('file'), async (req, res) => {
    try {
      ok(res, {
        fileName: req.file.originalname,
        fileUrl: fileUrl(req.file.filename),
        mimeType: req.file.mimetype,
        storageName: req.file.filename,
      });
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerWorkflowRoutes };
