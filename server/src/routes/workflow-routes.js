const { query } = require('../db');
const { ok, fail } = require('../lib/http');
const { now } = require('../lib/utils');
const { logAudit } = require('../services/audit-service');
const { requireAuth, requirePermission } = require('../services/permission-service');
const { canAccessApplicant } = require('../services/applicant-service');
const { getWorkflowByApplicantId, submitWorkflowTask, reviewWorkflowTask, assertWorkflowActor, isReviewerActor } = require('../services/workflow-service');
const { getWorkflowSettings, updateWorkflowSettings } = require('../services/settings-service');
const { fileUrl, acceptedTypesForMaterial, validateUploadedFile } = require('../services/file-service');
const { upload } = require('../upload-middleware');

function registerWorkflowRoutes(app) {

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
      ok(res, await submitWorkflowTask(req.user, req.params.applicantId, req.params.stepCode, req.body || {}, 'submit_step'), '步骤已提交');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/workflows/:applicantId/steps/:stepCode/review', requireAuth(), async (req, res) => {
    try {
      ok(res, await reviewWorkflowTask(req.user, req.params.applicantId, req.params.stepCode, req.body || {}, 'review_step'), '审核结果已保存');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.get('/api/workflow-settings', requireAuth(), async (req, res) => {
    try {
      ok(res, await getWorkflowSettings());
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.put('/api/workflow-settings', requireAuth(), requirePermission('configure_workflow'), async (req, res) => {
    try {
      ok(res, await updateWorkflowSettings(req.user, req.body || {}), '流程调试开关已保存');
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
      const { applicantId = '', stepCode = '', materialTag = '' } = req.body || {};
      if (!applicantId || !stepCode || !materialTag) {
        return fail(res, 400, '请在流程节点详情中上传材料');
      }
      if (!(await canAccessApplicant(req.user, applicantId))) return fail(res, 403, '无权上传该流程材料');
      const workflow = await getWorkflowByApplicantId(applicantId);
      const step = workflow.steps.find((item) => item.stepCode === stepCode);
      assertWorkflowActor(req.user, applicantId, workflow, step, isReviewerActor(req.user, step) ? 'review' : 'submit');
      validateUploadedFile(req.file, acceptedTypesForMaterial(step, materialTag));
      const inserted = await query(
        `INSERT INTO attachments (step_record_id, file_name, file_url, mime_type, material_tag, created_at)
         VALUES (:stepRecordId, :fileName, :fileUrl, :mimeType, :materialTag, :createdAt)`,
        {
          stepRecordId: step.id,
          fileName: req.file.originalname,
          fileUrl: fileUrl(req.file.filename),
          mimeType: req.file.mimetype,
          materialTag,
          createdAt: now(),
        },
      );
      ok(res, {
        attachmentId: inserted.insertId,
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

module.exports = { registerWorkflowRoutes };
