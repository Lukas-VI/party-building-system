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
    actorType: 'collaborative',
    responsibleRoles: ['applicant', 'organizer', 'branchSecretary'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 1,
    notificationTemplate: 'application_submitted',
    materialSchema: [
      { key: 'applicationLetter', label: '入党申请书', tag: 'application', accept: ['pdf'], required: true },
    ],
    businessFields: [
      { key: 'applicationSubmittedAt', label: '申请书提交时间', type: 'datetime', required: true, owner: 'applicant', placeholder: '例如 2026-05-01 09:00' },
    ],
    timeRule: { keepOnly: ['submittedAt'], allowManualEdit: false },
    taskSummary: '提交入党申请书并补全基础信息',
  },
  STEP_02: {
    actorType: 'collaborative',
    responsibleRoles: ['secretary', 'deputySecretary', 'organizer', 'branchSecretary', 'applicant'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 1,
    notificationTemplate: 'talk_schedule_confirm',
    materialSchema: [],
    businessFields: [
      { key: 'talkAssigneeName', label: '谈话人姓名', type: 'text', required: true, owner: 'reviewer', placeholder: '从本单位党委书记、副书记、组织员、党委委员中指派' },
      { key: 'talkAssigneeRole', label: '谈话人职务', type: 'select', required: true, owner: 'reviewer', options: ['党委书记', '党委副书记', '组织员', '党委委员'] },
      { key: 'scheduledAt', label: '谈话时间', type: 'datetime', required: true, owner: 'reviewer', placeholder: '例如 2026-05-01 14:30' },
      { key: 'location', label: '谈话地点', type: 'text', required: true, owner: 'reviewer' },
      { key: 'talkSummary', label: '谈话简要内容', type: 'textarea', required: false, owner: 'reviewer' },
      { key: 'applicantConfirm', label: '申请人确认', type: 'textarea', required: false, owner: 'applicant', placeholder: '如需改期，请在下方提交改期申请' },
    ],
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
    businessFields: [
      { key: 'activistDecision', label: '是否确定为入党积极分子', type: 'select', required: true, owner: 'reviewer', options: ['确定为入党积极分子', '暂不确定'] },
      { key: 'activistConfirmedAt', label: '确定日期', type: 'date', required: false, owner: 'reviewer' },
      { key: 'activistImportBatch', label: 'Excel导入批次/依据', type: 'text', required: false, owner: 'reviewer' },
      { key: 'decisionReason', label: '说明', type: 'textarea', required: false, owner: 'reviewer' },
    ],
    timeRule: { recordFields: ['noticeAt'] },
    taskSummary: '确认是否确定为入党积极分子，未确定的流程不得继续推进',
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
    businessFields: [
      { key: 'contactOneName', label: '培养联系人1', type: 'text', required: true, owner: 'reviewer', placeholder: '正式党员姓名' },
      { key: 'contactOnePhone', label: '联系人1联系方式', type: 'text', required: false, owner: 'reviewer' },
      { key: 'contactTwoName', label: '培养联系人2', type: 'text', required: false, owner: 'reviewer', placeholder: '可选，正式党员姓名' },
      { key: 'contactTwoPhone', label: '联系人2联系方式', type: 'text', required: false, owner: 'reviewer' },
    ],
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
    businessFields: [
      { key: 'partyCourseScore', label: '党课成绩', type: 'text', required: false, owner: 'reviewer', placeholder: '可填写成绩或导入批次' },
      { key: 'courseImportBatch', label: '党课成绩导入批次', type: 'text', required: false, owner: 'reviewer' },
      { key: 'activityRecords', label: '党内有关活动记录', type: 'textarea', required: true, owner: 'reviewer' },
      { key: 'cultivationComment', label: '培养教育考察意见', type: 'textarea', required: true, owner: 'reviewer' },
    ],
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
    businessFields: [
      { key: 'partyGroupOpinion', label: '党小组意见', type: 'textarea', required: true, owner: 'reviewer' },
      { key: 'contactOpinion', label: '培养联系人意见', type: 'textarea', required: true, owner: 'reviewer' },
      { key: 'memberMassOpinion', label: '党员和群众意见', type: 'textarea', required: true, owner: 'reviewer' },
      { key: 'developmentTargetAt', label: '确定为发展对象日期', type: 'date', required: true, owner: 'reviewer' },
    ],
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
    businessFields: [
      { key: 'introducerOneName', label: '入党介绍人1', type: 'text', required: true, owner: 'reviewer', placeholder: '默认可填培养联系人' },
      { key: 'introducerTwoName', label: '入党介绍人2', type: 'text', required: true, owner: 'reviewer', placeholder: '默认可填培养联系人' },
      { key: 'introducerChangeReason', label: '改选说明', type: 'textarea', required: false, owner: 'reviewer' },
    ],
    timeRule: { recordFields: ['confirmedAt'] },
    taskSummary: '确定两名正式党员作为入党介绍人',
  },
  STEP_09: {
    actorType: 'reviewer',
    responsibleRoles: ['organizer', 'branchSecretary'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'political_review_materials',
    materialSchema: [
      { key: 'politicalReviewScan', label: '政审扫描件', tag: 'political-review', accept: ['image'], required: true },
    ],
    businessFields: [
      { key: 'politicalReviewResult', label: '政审结论', type: 'select', required: true, owner: 'reviewer', options: ['合格', '需补充', '不合格'] },
      { key: 'politicalReviewComment', label: '政审说明', type: 'textarea', required: false, owner: 'reviewer' },
    ],
    timeRule: { recordFields: ['submittedAt', 'reviewedAt'] },
    taskSummary: '组织员上传政审扫描件并填写政审结论',
  },
  STEP_10: {
    actorType: 'collaborative',
    responsibleRoles: ['applicant', 'organizer', 'branchSecretary'],
    requiresApplicantAction: 1,
    requiresReviewerAction: 1,
    notificationTemplate: 'short_training_completed',
    materialSchema: [],
    businessFields: [
      { key: 'trainingStartAt', label: '培训开始时间', type: 'date', required: true, owner: 'applicant' },
      { key: 'trainingEndAt', label: '培训结束时间', type: 'date', required: true, owner: 'applicant' },
      { key: 'trainingLocation', label: '培训地点', type: 'text', required: true, owner: 'applicant' },
      { key: 'trainingMethod', label: '培训方式', type: 'text', required: true, owner: 'applicant', placeholder: '集中培训/线上线下结合等' },
      { key: 'trainingContent', label: '培训内容', type: 'textarea', required: true, owner: 'applicant' },
      { key: 'trainingReflection', label: '个人心得', type: 'textarea', required: true, owner: 'applicant' },
    ],
    timeRule: { recordFields: ['submittedAt'] },
    taskSummary: '填写短期集中培训时间、地点、方式、内容及个人心得',
  },
  STEP_11: {
    actorType: 'reviewer',
    responsibleRoles: ['branchSecretary', 'organizer'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'branch_review_result',
    materialSchema: [],
    businessFields: [
      { key: 'branchMeetingAt', label: '支委会会议时间', type: 'datetime', required: true, owner: 'reviewer' },
      { key: 'branchReviewResult', label: '支委会审查结果', type: 'select', required: true, owner: 'reviewer', options: ['合格，同意上报党委预审', '不合格，暂缓发展'] },
      { key: 'branchReviewComment', label: '讨论结果说明', type: 'textarea', required: true, owner: 'reviewer' },
    ],
    timeRule: { recordFields: ['reviewedAt'] },
    taskSummary: '通知支部审核结果',
  },
  STEP_12: {
    actorType: 'reviewer',
    responsibleRoles: ['secretary', 'deputySecretary', 'organizer'],
    requiresApplicantAction: 0,
    requiresReviewerAction: 1,
    notificationTemplate: 'party_committee_pre_review',
    materialSchema: [],
    businessFields: [
      { key: 'committeePreReviewAt', label: '党委预审时间', type: 'datetime', required: true, owner: 'reviewer' },
      { key: 'committeePreReviewResult', label: '预审结果', type: 'select', required: true, owner: 'reviewer', options: ['同意发展', '不同意发展'] },
      { key: 'committeePreReviewOpinion', label: '基层党委审核意见', type: 'textarea', required: true, owner: 'reviewer' },
    ],
    timeRule: { recordFields: ['submittedAt', 'reviewedAt'] },
    taskSummary: '基层党委预审并填写同意或不同意发展意见',
  },
};

/**
 * Build fallback workflow metadata for steps without explicit overrides.
 */
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

/**
 * Merge fallback workflow metadata with step-specific overrides.
 */
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
