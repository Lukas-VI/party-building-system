/**
 * H5 mobile workflow route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerMobileRoutes(app, ctx) {
  const {
    query,
    first,
    ok,
    fail,
    now,
    logAudit,
    requireAuth,
    assertCanAccessApplicant,
    getProfileViewByUser,
    upsertUserProfile,
    getWorkflowByApplicantId,
    isApplicantActor,
    isReviewerActor,
    assertWorkflowActor,
    nextTaskStatus,
    advanceAfterReview,
    listMobileTodos,
    listNotifications,
    createNotification,
    buildMobileWorkflow,
    buildMobileWorkbench,
    resolveMobileWorkflowId,
    ensureAdultApplicant,
    notificationRecipientsForStep,
    fileUrl,
    acceptedTypesForMaterial,
    validateUploadedFile,
    ALLOWED_REVIEW_STATUSES,
    upload,
  } = ctx;

  app.get('/api/mobile/workbench', requireAuth(), async (req, res) => {
    try {
      ok(res, await buildMobileWorkbench(req.user));
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.get('/api/mobile/todos', requireAuth(), async (req, res) => {
    try {
      ok(res, await listMobileTodos(req.user));
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.get('/api/mobile/messages', requireAuth(), async (req, res) => {
    try {
      ok(res, await listNotifications(req.user, 50));
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.get('/api/mobile/profile', requireAuth(), async (req, res) => {
    try {
      ok(res, await getProfileViewByUser(req.user));
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.put('/api/mobile/profile', requireAuth(), async (req, res) => {
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
      }
      await logAudit('mobile_profile', req.user.id, 'save_mobile_profile', req.user.id, payload);
      ok(res, true, '资料已保存');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.get('/api/mobile/workflows/:workflowId', requireAuth(), async (req, res) => {
    try {
      const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
      ok(res, await buildMobileWorkflow(req.user, applicantId));
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/mobile/workflows/:workflowId/tasks/:taskId/submit', requireAuth(), async (req, res) => {
    try {
      const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
      await assertCanAccessApplicant(req.user, applicantId);
      const workflow = await getWorkflowByApplicantId(applicantId);
      const step = workflow.steps.find((item) => item.stepCode === req.params.taskId);
      assertWorkflowActor(req.user, applicantId, workflow, step, 'submit');
      if (step.stepCode === 'STEP_01') {
        await ensureAdultApplicant(applicantId);
      }
      const mergedFormData = {
        ...step.formData,
        ...(req.body.formData || req.body || {}),
      };
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
          formDataJson: JSON.stringify(mergedFormData),
          reviewComment: req.body.reviewComment || '',
          operatorId: req.user.id,
          operatedAt: now(),
          id: step.id,
        },
      );
      await logAudit('workflow_step_records', step.id, 'mobile_submit_task', req.user.id, req.body || {});
      const recipients = await notificationRecipientsForStep(step, applicantId, [req.user.id]);
      for (const userId of recipients) {
        await createNotification(
          userId,
          'task_submitted',
          `${step.name}待处理`,
          `${req.user.name}已提交“${step.name}”，请按流程要求及时处理。`,
          step.stepCode,
          'workflow',
          applicantId,
        );
      }
      ok(res, true, '任务已提交');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/mobile/workflows/:workflowId/tasks/:taskId/review', requireAuth(), async (req, res) => {
    try {
      const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
      await assertCanAccessApplicant(req.user, applicantId);
      const workflow = await getWorkflowByApplicantId(applicantId);
      const step = workflow.steps.find((item) => item.stepCode === req.params.taskId);
      assertWorkflowActor(req.user, applicantId, workflow, step, 'review');
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
      await logAudit('workflow_step_records', step.id, 'mobile_review_task', req.user.id, req.body || {});
      await createNotification(
        applicantId,
        'task_reviewed',
        `${step.name}${nextStatus === 'approved' ? '已通过' : '需补充'}`,
        nextStatus === 'approved' ? `“${step.name}”已审核通过，请关注下一步通知。` : `“${step.name}”已退回，请根据意见补充材料。`,
        step.stepCode,
        'workflow',
        applicantId,
      );
      ok(res, true, '审核结果已保存');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/mobile/workflows/:workflowId/tasks/:taskId/reschedule', requireAuth(), async (req, res) => {
    try {
      const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
      await assertCanAccessApplicant(req.user, applicantId);
      const workflow = await getWorkflowByApplicantId(applicantId);
      const step = workflow.steps.find((item) => item.stepCode === req.params.taskId);
      if (!step) return fail(res, 404, '未找到对应任务');
      if (step.stepCode !== 'STEP_02') return fail(res, 400, '当前任务不支持改期');
      if (!(isApplicantActor(req.user, applicantId, step) || isReviewerActor(req.user, step))) {
        return fail(res, 403, '当前账号不能调整该任务时间');
      }
      const nextHistory = [
        ...(step.rescheduleHistory || []),
        {
          operatorId: req.user.id,
          operatorName: req.user.name,
          requestedAt: now(),
          scheduledAt: req.body.scheduledAt || '',
          location: req.body.location || '',
          reason: req.body.reason || '',
        },
      ];
      await query(
        `UPDATE workflow_step_records
         SET task_status = 'reschedule_requested',
             form_data_json = :formDataJson,
             reschedule_count = :rescheduleCount,
             reschedule_history_json = :rescheduleHistoryJson,
             last_operator_id = :operatorId,
             operated_at = :operatedAt
         WHERE id = :id`,
        {
          formDataJson: JSON.stringify({
            ...step.formData,
            meetingProposal: {
              scheduledAt: req.body.scheduledAt || '',
              location: req.body.location || '',
              reason: req.body.reason || '',
            },
          }),
          rescheduleCount: Number(step.rescheduleCount || 0) + 1,
          rescheduleHistoryJson: JSON.stringify(nextHistory),
          operatorId: req.user.id,
          operatedAt: now(),
          id: step.id,
        },
      );
      await logAudit('workflow_step_records', step.id, 'mobile_reschedule_task', req.user.id, req.body || {});
      const recipients = await notificationRecipientsForStep(step, applicantId, [req.user.id]);
      for (const userId of recipients) {
        await createNotification(
          userId,
          'reschedule_requested',
          '谈话时间变更待确认',
          `${req.user.name}提交了新的谈话安排，请尽快确认或调整。`,
          step.stepCode,
          'workflow',
          applicantId,
        );
      }
      ok(res, true, '改期申请已提交');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/mobile/files/upload', requireAuth(), upload.single('file'), async (req, res) => {
    try {
      const { workflowId = '', stepCode = '', materialTag = '' } = req.body || {};
      validateUploadedFile(req.file, ['pdf', 'image']);
      let attachmentId = null;
      if (workflowId && stepCode) {
        const applicantId = resolveMobileWorkflowId(req.user, workflowId);
        await assertCanAccessApplicant(req.user, applicantId);
        const workflow = await getWorkflowByApplicantId(applicantId);
        const step = workflow.steps.find((item) => item.stepCode === stepCode);
        assertWorkflowActor(req.user, applicantId, workflow, step, 'submit');
        validateUploadedFile(req.file, acceptedTypesForMaterial(step, materialTag));
        const instance = await first('SELECT id FROM workflow_instances WHERE applicant_id = :applicantId', { applicantId });
        const stepRecord = await first(
          'SELECT id FROM workflow_step_records WHERE instance_id = :instanceId AND step_code = :stepCode',
          { instanceId: instance.id, stepCode },
        );
        if (stepRecord) {
          const inserted = await query(
            `INSERT INTO attachments (step_record_id, file_name, file_url, mime_type, material_tag, created_at)
             VALUES (:stepRecordId, :fileName, :fileUrl, :mimeType, :materialTag, :createdAt)`,
            {
              stepRecordId: stepRecord.id,
              fileName: req.file.originalname,
              fileUrl: fileUrl(req.file.filename),
              mimeType: req.file.mimetype,
              materialTag,
              createdAt: now(),
            },
          );
          attachmentId = inserted.insertId;
        }
      }
      ok(res, {
        attachmentId,
        fileName: req.file.originalname,
        fileUrl: fileUrl(req.file.filename),
        mimeType: req.file.mimetype,
        materialTag,
        storageName: req.file.filename,
      });
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });
}

module.exports = { registerMobileRoutes };
