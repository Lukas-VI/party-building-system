const { query, first } = require('../db');
const { ok, fail } = require('../lib/http');
const { now } = require('../lib/utils');
const { logAudit } = require('../services/audit-service');
const { requireAuth, assertCanAccessApplicant } = require('../services/permission-service');
const { getProfileViewByUser, upsertUserProfile } = require('../services/profile-service');
const { getWorkflowByApplicantId, isApplicantActor, isReviewerActor, assertWorkflowActor, submitWorkflowTask, reviewWorkflowTask } = require('../services/workflow-service');
const { listMobileTodos, buildMobileWorkflow, buildMobileWorkbench, resolveMobileWorkflowId } = require('../services/mobile-workbench-service');
const { listNotifications, getNotificationForUser, markNotificationRead, createNotification, notificationRecipientsForStep } = require('../services/notification-service');
const { fileUrl, acceptedTypesForMaterial, validateUploadedFile } = require('../services/file-service');
const { upload } = require('../upload-middleware');

function registerMobileRoutes(app) {

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

  app.get('/api/mobile/messages/:messageId', requireAuth(), async (req, res) => {
    try {
      ok(res, await getNotificationForUser(req.user, req.params.messageId));
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/mobile/messages/:messageId/read', requireAuth(), async (req, res) => {
    try {
      ok(res, await markNotificationRead(req.user, req.params.messageId), '消息已标记为已读');
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
      ok(res, await submitWorkflowTask(req.user, applicantId, req.params.taskId, req.body || {}, 'mobile_submit_task'), '任务已提交');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/mobile/workflows/:workflowId/tasks/:taskId/review', requireAuth(), async (req, res) => {
    try {
      const applicantId = resolveMobileWorkflowId(req.user, req.params.workflowId);
      ok(res, await reviewWorkflowTask(req.user, applicantId, req.params.taskId, req.body || {}, 'mobile_review_task'), '审核结果已保存');
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
        assertWorkflowActor(req.user, applicantId, workflow, step, isReviewerActor(req.user, step) ? 'review' : 'submit');
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
