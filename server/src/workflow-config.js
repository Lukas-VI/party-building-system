/**
 * 服务号网页 App 的流程细化规则集中配置。
 *
 * 维护原则：
 * 1. 25 步仍是正式流程主线，不在页面里硬编码步骤规则。
 * 2. 当前文件只承接“前 12 步已明确的细化规则”和默认兜底规则。
 * 3. 后续每步填写/提交内容的细化，应结合 docs/electronic-dossier.md 和会议纪要继续维护。
 * 4. 服务端接口和移动端页面都应优先读取这里，而不是各自复制一套条件分支。
 */
const STEP_DETAIL_OVERRIDES = {
  STEP_01: {
    actorType: 'applicant',
    responsibleRoles: ['applicant'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 0,
    notificationTemplate: 'application_submitted',
    materialSchema: [
      { key: 'applicationLetter', label: '入党申请书', tag: 'application', accept: ['pdf', 'image'], required: true },
    ],
    timeRule: { keepOnly: ['submittedAt'], allowManualEdit: false },
    taskSummary: '提交入党申请书并补全基础信息',
  },
  STEP_02: {
    actorType: 'collaborative',
    responsibleRoles: ['branchSecretary', 'organizer', 'applicant'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 1,
    notificationTemplate: 'talk_schedule_confirm',
    materialSchema: [],
    timeRule: { allowReschedule: true, maxApplicantReschedule: 1, branchSecretaryCanAdjust: true },
    taskSummary: '确定谈话安排并确认谈话结果',
  },
  STEP_03: {
    actorType: 'reviewer',
    responsibleRoles: ['organizer', 'secretary'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'activist_confirmed',
    materialSchema: [],
    timeRule: { recordFields: ['noticeAt'] },
    taskSummary: '发送确定为入党积极分子通知',
  },
  STEP_04: {
    actorType: 'system',
    responsibleRoles: ['organizer'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'qualification_checked',
    materialSchema: [],
    timeRule: { recordFields: ['checkedAt'] },
    taskSummary: '完成资格确认并清理冗余信息',
  },
  STEP_05: {
    actorType: 'reviewer',
    responsibleRoles: ['organizer', 'branchSecretary'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'contact_assigned',
    materialSchema: [],
    timeRule: { recordFields: ['confirmedAt'] },
    taskSummary: '指定培养联系人并完成确认',
  },
  STEP_06: {
    actorType: 'reviewer',
    responsibleRoles: ['organizer', 'branchSecretary'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'cultivation_checked',
    materialSchema: [],
    timeRule: { recordFields: ['confirmedAt'] },
    taskSummary: '培养教育考察记录维护',
  },
  STEP_07: {
    actorType: 'reviewer',
    responsibleRoles: ['secretary', 'deputySecretary', 'organizer'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'development_target_confirmed',
    materialSchema: [],
    timeRule: { recordFields: ['noticeAt'] },
    taskSummary: '确定发展对象并发送党委通知',
  },
  STEP_08: {
    actorType: 'reviewer',
    responsibleRoles: ['organizer', 'branchSecretary'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'introducer_confirmed',
    materialSchema: [],
    timeRule: { recordFields: ['confirmedAt'] },
    taskSummary: '确认培养人信息',
  },
  STEP_09: {
    actorType: 'applicant',
    responsibleRoles: ['applicant', 'organizer', 'branchSecretary'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 1,
    notificationTemplate: 'political_review_materials',
    materialSchema: [
      { key: 'parents', label: '父母材料', tag: 'parents', accept: ['pdf', 'image'], required: true },
      { key: 'socialRelations', label: '社会关系材料', tag: 'social', accept: ['pdf', 'image'], required: true },
      { key: 'other', label: '其他政审材料', tag: 'other', accept: ['pdf', 'image'], required: false },
    ],
    timeRule: { recordFields: ['submittedAt', 'reviewedAt'] },
    taskSummary: '上传政审材料并完成审核',
  },
  STEP_10: {
    actorType: 'applicant',
    responsibleRoles: ['applicant'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 0,
    notificationTemplate: 'profile_completed',
    materialSchema: [],
    timeRule: { recordFields: ['submittedAt'] },
    taskSummary: '完善本人信息',
  },
  STEP_11: {
    actorType: 'reviewer',
    responsibleRoles: ['branchSecretary', 'organizer'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'branch_review_result',
    materialSchema: [],
    timeRule: { recordFields: ['reviewedAt'] },
    taskSummary: '通知支部审核结果',
  },
  STEP_12: {
    actorType: 'collaborative',
    responsibleRoles: ['applicant', 'organizer', 'branchSecretary'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 1,
    notificationTemplate: 'material_submission',
    materialSchema: [
      { key: 'developmentPacket', label: '发展材料', tag: 'development', accept: ['pdf', 'image'], required: true },
    ],
    timeRule: { recordFields: ['submittedAt', 'reviewedAt'] },
    taskSummary: '补交发展材料并完成收件',
  },
};

function defaultStepDetail(stepCode, roleIds = []) {
  const reviewerRoles = roleIds.filter((roleId) => roleId !== 'applicant');
  const hasApplicant = roleIds.includes('applicant');
  return {
    actorType: reviewerRoles.length && hasApplicant ? 'collaborative' : hasApplicant ? 'applicant' : 'reviewer',
    responsibleRoles: roleIds,
    requiresApplicantAction: hasApplicant ? 1 : 0,
    requiresReviewerAction: reviewerRoles.length ? 1 : 0,
    notificationTemplate: `${stepCode.toLowerCase()}_updated`,
    materialSchema: [],
    timeRule: { recordFields: ['operatedAt'] },
    taskSummary: '按流程要求完成本步骤的填报、审核与留痕。',
  };
}

function getStepDetail(stepCode, roleIds = []) {
  return {
    ...defaultStepDetail(stepCode, roleIds),
    ...(STEP_DETAIL_OVERRIDES[stepCode] || {}),
  };
}

module.exports = {
  STEP_DETAIL_OVERRIDES,
  getStepDetail,
};
