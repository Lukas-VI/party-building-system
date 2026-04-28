const { query, first } = require('../db');
const { now, parseJson } = require('../lib/utils');
const { roleScopeLabel } = require('./permission-service');

function profileTypeForRole(role) {
  if (role === 'applicant') return 'applicant';
  if (['branchSecretary', 'organizer'].includes(role)) return 'cadre';
  return 'admin';
}

function buildDefaultProfilePayload(user) {
  if (user.primaryRole === 'applicant') {
    return {
      name: user.name,
      username: user.username,
      currentStage: '入党申请人',
      phone: '',
      education: '',
      degree: '',
      unitName: user.orgName || '',
      occupation: '',
      specialty: '',
      resume: '',
      familyInfo: '',
      awards: '',
    };
  }
  if (['branchSecretary', 'organizer'].includes(user.primaryRole)) {
    return {
      name: user.name,
      username: user.username,
      roleLabel: user.roles[0]?.label || '管理角色',
      orgName: user.orgName || '',
      branchName: user.branchName || '',
      phone: '',
      dutySummary: '',
      workFocus: '',
    };
  }
  return {
    name: user.name,
    username: user.username,
    roleLabel: user.roles[0]?.label || '系统角色',
    scopeLabel: roleScopeLabel(user),
    phone: '',
    managementScope: '',
    systemNote: '',
  };
}

async function getApplicantProfileByUserId(userId) {
  return first(
    `SELECT
        ap.user_id AS userId,
        u.username,
        u.name,
        o.name AS orgName,
        b.name AS branchName,
        ap.current_stage AS currentStage,
        ap.phone,
        ap.education,
        ap.degree,
        ap.unit_name AS unitName,
        ap.occupation,
        ap.profile_json AS profileJson
     FROM applicant_profiles ap
     INNER JOIN users u ON u.id = ap.user_id
     LEFT JOIN org_units o ON o.id = u.org_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE ap.user_id = :userId`,
    { userId },
  );
}

async function getUserProfileRecord(userId) {
  return first(
    `SELECT
        user_id AS userId,
        profile_type AS profileType,
        profile_json AS profileJson,
        updated_at AS updatedAt
     FROM user_profiles
     WHERE user_id = :userId`,
    { userId },
  );
}

async function getProfileViewByUser(user) {
  const profileRecord = await getUserProfileRecord(user.id);
  const baseProfile = buildDefaultProfilePayload(user);
  if (user.primaryRole === 'applicant') {
    const applicantProfile = await getApplicantProfileByUserId(user.id);
    return {
      ...baseProfile,
      ...parseJson(profileRecord?.profileJson, {}),
      ...parseJson(applicantProfile?.profileJson, {}),
      userId: user.id,
      username: user.username,
      name: user.name,
      orgName: user.orgName,
      branchName: user.branchName,
      currentStage: applicantProfile?.currentStage || baseProfile.currentStage,
      phone: applicantProfile?.phone || '',
      education: applicantProfile?.education || '',
      degree: applicantProfile?.degree || '',
      unitName: applicantProfile?.unitName || user.orgName || '',
      occupation: applicantProfile?.occupation || '',
      roleLabel: user.roles[0]?.label || '入党申请人',
      scopeLabel: roleScopeLabel(user),
      profileType: profileRecord?.profileType || 'applicant',
    };
  }
  return {
    ...baseProfile,
    ...parseJson(profileRecord?.profileJson, {}),
    userId: user.id,
    username: user.username,
    name: user.name,
    orgName: user.orgName,
    branchName: user.branchName,
    roleLabel: user.roles[0]?.label || '系统用户',
    scopeLabel: roleScopeLabel(user),
    profileType: profileRecord?.profileType || profileTypeForRole(user.primaryRole),
  };
}

async function upsertUserProfile(user, payload) {
  const profileType = profileTypeForRole(user.primaryRole);
  await query(
    `INSERT INTO user_profiles (user_id, profile_type, profile_json, updated_at)
     VALUES (:userId, :profileType, :profileJson, :updatedAt)
     ON DUPLICATE KEY UPDATE
       profile_type = VALUES(profile_type),
       profile_json = VALUES(profile_json),
       updated_at = VALUES(updated_at)`,
    {
      userId: user.id,
      profileType,
      profileJson: JSON.stringify(payload),
      updatedAt: now(),
    },
  );
}

module.exports = {
  profileTypeForRole,
  buildDefaultProfilePayload,
  getApplicantProfileByUserId,
  getUserProfileRecord,
  getProfileViewByUser,
  upsertUserProfile,
};
