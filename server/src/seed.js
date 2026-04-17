const STEP_NAMES = [
  '递交入党申请书',
  '党组织派人谈话',
  '确定入党积极分子',
  '流程资格确认',
  '指定培养联系人',
  '培养教育考察',
  '确定发展对象',
  '确定入党介绍人',
  '政治审查',
  '短期集中培训',
  '支部委员会审查',
  '上级党委预审',
  '填写入党志愿书',
  '支部大会讨论',
  '上级党委派人谈话',
  '上级党委审批',
  '预备党员入党宣誓',
  '编入党支部和党小组',
  '继续教育考察',
  '提出转正申请',
  '支部大会讨论转正',
  '上级党委审批转正',
  '延长预备期或结项',
  '材料归档',
  '正式党员结果确认',
];

const permissions = [
  ['view_dashboard', '查看工作台'],
  ['view_applicants', '查看申请人台账'],
  ['view_workflows', '查看流程详情'],
  ['review_steps', '审核流程节点'],
  ['export_branch', '导出本支部数据'],
  ['export_org', '导出本单位数据'],
  ['export_all', '导出全校数据'],
  ['view_org_stats', '查看单位统计'],
  ['view_branch_stats', '查看支部统计'],
  ['manage_orgs', '管理组织机构'],
  ['assign_roles', '分配角色'],
  ['configure_workflow', '配置流程时限'],
  ['approve_registration', '审核注册'],
];

const roles = [
  ['applicant', '入党申请人', 'self', ['view_workflows']],
  ['branchSecretary', '党支部书记', 'branch', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_branch', 'view_branch_stats']],
  ['secretary', '二级单位党委/总支书记', 'org', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_org', 'view_org_stats']],
  ['deputySecretary', '二级单位党委/总支副书记', 'org', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_org', 'view_org_stats']],
  ['organizer', '组织员', 'org', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_org', 'view_org_stats', 'approve_registration', 'assign_roles']],
  ['orgDept', '校党委组织部人员', 'all', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_all', 'view_org_stats', 'view_branch_stats', 'approve_registration']],
  ['superAdmin', '超级管理员', 'all', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_all', 'view_org_stats', 'view_branch_stats', 'manage_orgs', 'assign_roles', 'configure_workflow', 'approve_registration']],
];

const orgUnits = [
  ['org-literature', '文学院党委'],
  ['org-math', '数学与统计学院党委'],
  ['org-physics', '物理学院党委'],
];

const branches = [
  ['branch-literature-1', '文学院学生第一党支部', 'org-literature'],
  ['branch-literature-2', '文学院学生第二党支部', 'org-literature'],
  ['branch-math-1', '数学学院学生党支部', 'org-math'],
  ['branch-physics-1', '物理学院学生党支部', 'org-physics'],
];

const users = [
  ['u-applicant-001', '2023001', '123456', '张明远', 'active', 'org-literature', 'branch-literature-1'],
  ['u-applicant-002', '2023002', '123456', '陈思源', 'active', 'org-literature', 'branch-literature-2'],
  ['u-applicant-003', '2023101', '123456', '刘星河', 'active', 'org-math', 'branch-math-1'],
  ['u-applicant-004', '2023201', '123456', '孙知行', 'active', 'org-physics', 'branch-physics-1'],
  ['u-applicant-005', '2023202', '123456', '赵知礼', 'pending', 'org-physics', 'branch-physics-1'],
  ['u-branch-001', 'zb001', '123456', '李支书', 'active', 'org-literature', 'branch-literature-1'],
  ['u-organizer-001', 'zz001', '123456', '王组织', 'active', 'org-literature', null],
  ['u-secretary-001', 'orgsec1', '123456', '韩书记', 'active', 'org-literature', null],
  ['u-deputy-001', 'orgdep1', '123456', '马副书记', 'active', 'org-literature', null],
  ['u-orgdept-001', 'org001', '123456', '周部长', 'active', null, null],
  ['u-admin-001', 'admin', '123456', '系统管理员', 'active', null, null],
];

const userRoles = [
  ['u-applicant-001', 'applicant'],
  ['u-applicant-002', 'applicant'],
  ['u-applicant-003', 'applicant'],
  ['u-applicant-004', 'applicant'],
  ['u-applicant-005', 'applicant'],
  ['u-branch-001', 'branchSecretary'],
  ['u-organizer-001', 'organizer'],
  ['u-secretary-001', 'secretary'],
  ['u-deputy-001', 'deputySecretary'],
  ['u-orgdept-001', 'orgDept'],
  ['u-admin-001', 'superAdmin'],
];

const profiles = [
  ['u-applicant-001', '入党积极分子', '13800001234', '高中', '无', '河南师范大学文学院', '河南师范大学文学院汉语言文学专业2023级1班班长'],
  ['u-applicant-002', '发展对象', '13800004567', '高中', '无', '河南师范大学文学院', '河南师范大学文学院秘书学专业2023级1班'],
  ['u-applicant-003', '预备党员', '13800007890', '高中', '无', '河南师范大学数学与统计学院', '河南师范大学数学与应用数学专业2023级2班'],
  ['u-applicant-004', '入党申请人', '13800009999', '高中', '无', '河南师范大学物理学院', '河南师范大学物理学专业2023级1班'],
  ['u-applicant-005', '入党申请人', '13800006666', '高中', '无', '河南师范大学物理学院', '河南师范大学电子信息专业2023级2班']
];

const registrationRequests = [
  ['reg-001', 'u-applicant-005', '赵知礼', '410102200505054321', '2023202', 'pending', '2026-04-17 09:30:00']
];

function makeStepDefinitions() {
  return STEP_NAMES.map((name, index) => ({
    stepCode: `STEP_${String(index + 1).padStart(2, '0')}`,
    sortOrder: index + 1,
    name,
    phase: index < 10 ? '培养考察' : index < 18 ? '接收预备党员' : '预备党员转正',
    allowedRoles: index < 10 ? ['applicant', 'organizer', 'branchSecretary'] : ['organizer', 'secretary', 'orgDept'],
    formSchema: {
      fields: ['summary', 'note'],
      attachment: index === 0 || index === 8,
    },
  }));
}

function stageProgress(stage) {
  const map = {
    '入党申请人': 2,
    '入党积极分子': 6,
    '发展对象': 12,
    '预备党员': 20,
    '正式党员': 25,
  };
  return map[stage] || 1;
}

module.exports = {
  permissions,
  roles,
  orgUnits,
  branches,
  users,
  userRoles,
  profiles,
  registrationRequests,
  stepDefinitions: makeStepDefinitions(),
  stageProgress,
};
