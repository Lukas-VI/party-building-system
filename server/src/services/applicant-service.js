const { query, first } = require('../db');
const { now } = require('../lib/utils');
const { scopeClause } = require('./permission-service');
const { getUserWithAuth } = require('./auth-service');
const {
  buildDefaultProfilePayload,
  getUserProfileRecord,
  upsertUserProfile,
} = require('./profile-service');

async function getApplicants(user, filters = {}) {
  const scope = scopeClause(user, 'u');
  return query(
    `SELECT
        u.id,
        u.username,
        u.name,
        u.status,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        o.name AS orgName,
        b.name AS branchName,
        ap.current_stage AS currentStage,
        ap.phone,
        ap.unit_name AS unitName,
        ap.occupation
     FROM applicant_profiles ap
     INNER JOIN users u ON u.id = ap.user_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE 1 = 1
       ${scope.sql}
       ${filters.orgId ? ' AND u.org_id = :orgId' : ''}
       ${filters.branchId ? ' AND u.branch_id = :branchId' : ''}
       ${filters.stage ? ' AND ap.current_stage = :stage' : ''}
       ${filters.keyword ? ' AND (u.name LIKE :keyword OR u.username LIKE :keyword OR ap.unit_name LIKE :keyword)' : ''}
     ORDER BY u.username ASC`,
    {
      ...scope.params,
      orgId: filters.orgId,
      branchId: filters.branchId,
      stage: filters.stage,
      keyword: filters.keyword ? `%${filters.keyword}%` : undefined,
    },
  );
}

async function listRegistrationRequests(user, filters = {}) {
  const scope = scopeClause(user, 'u');
  return query(
    `SELECT
        rr.request_no AS requestNo,
        rr.user_id AS userId,
        rr.name,
        rr.employee_no AS employeeNo,
        rr.status,
        rr.created_at AS createdAt,
        rr.reviewed_at AS reviewedAt,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        o.name AS orgName,
        b.name AS branchName
     FROM registration_requests rr
     INNER JOIN users u ON u.id = rr.user_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE 1 = 1
       ${scope.sql}
       ${filters.status ? ' AND rr.status = :status' : ''}
     ORDER BY
       CASE WHEN rr.status = 'pending' THEN 0 ELSE 1 END,
       rr.created_at DESC`,
    {
      ...scope.params,
      status: filters.status || undefined,
    },
  );
}

async function canAccessApplicant(user, applicantId) {
  const rows = await getApplicants(user, {});
  return rows.some((item) => item.id === applicantId);
}

async function ensureApplicantEnrollment(userId) {
  const user = await getUserWithAuth(userId);
  if (!user) return;

  const existingProfile = await first(
    `SELECT user_id AS userId
     FROM applicant_profiles
     WHERE user_id = :userId`,
    { userId },
  );
  if (!existingProfile) {
    const profilePayload = buildDefaultProfilePayload({
      ...user,
      primaryRole: 'applicant',
    });
    await query(
      `INSERT INTO applicant_profiles
        (user_id, current_stage, phone, education, degree, unit_name, occupation, profile_json, updated_at)
       VALUES (:userId, '入党申请人', '', '', '', :unitName, '', :profileJson, :updatedAt)`,
      {
        userId,
        unitName: user.orgName || '',
        profileJson: JSON.stringify(profilePayload),
        updatedAt: now(),
      },
    );
  }

  const workflowInstanceId = `wf-${userId}`;
  const existingWorkflow = await first(
    `SELECT id
     FROM workflow_instances
     WHERE applicant_id = :applicantId`,
    { applicantId: userId },
  );
  if (!existingWorkflow) {
    await query(
      `INSERT INTO workflow_instances (id, applicant_id, current_stage, updated_at)
       VALUES (:id, :applicantId, '入党申请人', :updatedAt)`,
      {
        id: workflowInstanceId,
        applicantId: userId,
        updatedAt: now(),
      },
    );
  }

  const existingStep = await first(
    `SELECT id
     FROM workflow_step_records
     WHERE instance_id = :instanceId
     LIMIT 1`,
    { instanceId: workflowInstanceId },
  );
  if (!existingStep) {
    const definitions = await query(
      `SELECT
          step_code AS stepCode,
          sort_order AS sortOrder,
          end_at AS endAt
       FROM workflow_step_definitions
       ORDER BY sort_order ASC`,
    );
    for (const item of definitions) {
      const isFirstStep = Number(item.sortOrder || 0) === 1;
      await query(
        `INSERT INTO workflow_step_records
          (instance_id, step_code, status, form_data_json, review_comment, last_operator_id, operated_at, deadline, task_status, confirmed_at, reschedule_count, reschedule_history_json)
         VALUES
          (:instanceId, :stepCode, :status, :formDataJson, '', NULL, NULL, :deadline, :taskStatus, NULL, 0, :rescheduleHistoryJson)`,
        {
          instanceId: workflowInstanceId,
          stepCode: item.stepCode,
          status: isFirstStep ? 'pending' : 'locked',
          formDataJson: JSON.stringify({}),
          deadline: item.endAt,
          taskStatus: isFirstStep ? 'open' : 'waiting',
          rescheduleHistoryJson: JSON.stringify([]),
        },
      );
    }
  }

  const profileRecord = await getUserProfileRecord(userId);
  if (!profileRecord) {
    await upsertUserProfile(
      { ...user, primaryRole: 'applicant' },
      buildDefaultProfilePayload({ ...user, primaryRole: 'applicant' }),
    );
  }
}

module.exports = {
  getApplicants,
  listRegistrationRequests,
  canAccessApplicant,
  ensureApplicantEnrollment,
};
