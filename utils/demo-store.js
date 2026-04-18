const SEED_USER = {
  id: 'u-applicant-001',
  username: '2023001',
  password: '123456',
  name: 'Name',
  role: 'applicant',
  roleLabel: '入党申请人',
  orgId: 'org-literature',
  orgName: '文学院党委',
  branchId: 'branch-literature-1',
  branchName: '文学院学生第一党支部',
  scopeLabel: '本人数据',
  currentStage: '入党积极分子',
};

const DEMO_ACCOUNTS = [
  SEED_USER,
  {
    id: 'u-organizer-001',
    username: 'zz001',
    password: '123456',
    name: 'Name',
    role: 'organizer',
    roleLabel: '组织员',
    orgId: 'org-literature',
    orgName: '文学院党委',
    branchId: '',
    branchName: '',
    scopeLabel: '本单位数据',
    currentStage: '流程管理',
  },
  {
    id: 'u-branch-001',
    username: 'zb001',
    password: '123456',
    name: 'Name',
    role: 'branchSecretary',
    roleLabel: '党支部书记',
    orgId: 'org-literature',
    orgName: '文学院党委',
    branchId: 'branch-literature-1',
    branchName: '文学院学生第一党支部',
    scopeLabel: '本支部数据',
    currentStage: '支部审核',
  },
  {
    id: 'u-org-001',
    username: 'org001',
    password: '123456',
    name: 'Name',
    role: 'orgDept',
    roleLabel: '校党委组织部人员',
    orgId: '',
    orgName: '党委组织部',
    branchId: '',
    branchName: '',
    scopeLabel: '全校数据',
    currentStage: '全校统计',
  },
  {
    id: 'u-admin-001',
    username: 'admin',
    password: '123456',
    name: 'Name',
    role: 'superAdmin',
    roleLabel: '超级管理员',
    orgId: '',
    orgName: '系统管理',
    branchId: '',
    branchName: '',
    scopeLabel: '全局数据',
    currentStage: '系统配置',
  },
];

const WORKFLOW_STEPS = [
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

const STATUS_META = {
  pending: { text: '待填写', className: 'badge-warning' },
  reviewing: { text: '待审核', className: 'badge-primary' },
  approved: { text: '已通过', className: 'badge-success' },
  rejected: { text: '已驳回', className: 'badge-danger' },
  locked: { text: '已锁定', className: 'badge-primary' },
};

function buildDefaultWorkflow() {
  return WORKFLOW_STEPS.map((name, index) => {
    let status = 'locked';
    if (index < 4) status = 'approved';
    if (index === 4) status = 'pending';
    if (index === 5) status = 'reviewing';
    return {
      stepCode: `STEP_${String(index + 1).padStart(2, '0')}`,
      name,
      phase: index < 10 ? '培养考察' : index < 18 ? '接收预备党员' : '预备党员转正',
      status,
      deadline: index < 10 ? '2026-05-15' : '2026-06-30',
      formData: {
        summary: index < 4 ? `${name}已完成录入` : '',
        note: index === 4 ? '待组织员指定两名培养联系人' : '',
      },
      lastOperator: index < 4 ? 'Name' : '',
      operatedAt: index < 4 ? '2026-04-15 10:30' : '',
      reviewComment: '',
      attachments: [],
    };
  });
}

function buildDefaultProfile(user) {
  if (user.role === 'applicant') {
    return {
      name: 'Name',
      idNo: '410123199910101234',
      gender: '男',
      ethnicity: '汉族',
      nativePlace: '河南省新乡市',
      birthPlace: '河南省新乡市',
      phone: '13800001234',
      education: '高中',
      degree: '无',
      occupation: '河南师范大学文学院汉语言文学专业2023级1班班长',
      specialty: '写作、演讲',
      unitName: '河南师范大学文学院',
      leagueJoinDate: '2015-05',
      resume: '2010.09-2016.06 新乡市实验小学 学生；2016.09-2022.06 新乡市第一中学 学生；2023.09至今 河南师范大学文学院 学生',
      familyInfo: '家庭与社会关系材料待补充',
      awards: '2024年校级优秀学生干部；2025年一等奖学金',
    };
  }
  if (['branchSecretary', 'organizer'].includes(user.role)) {
    return {
      name: 'Name',
      username: user.username,
      phone: '13800004567',
      orgName: user.orgName,
      branchName: user.branchName,
      roleLabel: user.roleLabel,
      dutySummary: user.role === 'organizer' ? '负责本单位注册审核、流程推进与联系人分配。' : '负责支部级流程审核、支部大会材料核对与导出。',
      workFocus: user.role === 'organizer' ? '重点跟进入党积极分子确定和发展对象培养环节。' : '重点跟进支部大会讨论、材料完整性与节点时限。',
    };
  }
  return {
    name: 'Name',
    username: user.username,
    phone: '13800007890',
    roleLabel: user.roleLabel,
    scopeLabel: user.scopeLabel,
    managementScope: user.role === 'superAdmin' ? '维护全局组织结构、角色权限与流程配置。' : '负责全校统计汇总、跨单位审核与数据导出。',
    systemNote: user.role === 'superAdmin' ? '用于演示管理员配置流程与后台权限控制。' : '用于演示组织部全校统计与流程监管。',
  };
}

function buildDefaultProfiles() {
  return DEMO_ACCOUNTS.reduce((result, user) => {
    result[user.id] = buildDefaultProfile(user);
    return result;
  }, {});
}

function getStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

function setStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    console.warn('storage write failed', error);
  }
}

function ensureSeed() {
  const seeded = getStorage('dj_workflow_seeded', false);
  const storedAccounts = getStorage('dj_accounts', []);
  const storedProfiles = getStorage('dj_profiles', {});
  const mergedAccounts = DEMO_ACCOUNTS.map((account) => {
    const existing = storedAccounts.find((item) => item.username === account.username);
    return existing ? { ...account, ...existing } : account;
  });
  const mergedProfiles = {
    ...buildDefaultProfiles(),
    ...storedProfiles,
  };
  setStorage('dj_accounts', mergedAccounts);
  setStorage('dj_profiles', mergedProfiles);
  const currentUser = getStorage('dj_user', null);
  if (currentUser?.username) {
    const refreshedUser = mergedAccounts.find((item) => item.username === currentUser.username);
    if (refreshedUser) {
      setStorage('dj_user', refreshedUser);
    }
  }
  if (!seeded) {
    setStorage('dj_workflow', buildDefaultWorkflow());
    if (!currentUser) {
      setStorage('dj_user', null);
    }
    setStorage('dj_registrations', []);
    setStorage('dj_workflow_seeded', true);
  }
}

function loginLocal(username, password) {
  ensureSeed();
  const accounts = getStorage('dj_accounts', DEMO_ACCOUNTS);
  const matched = accounts.find((item) => item.username === username && item.password === password);
  if (!matched) return null;
  setStorage('dj_user', matched);
  return matched;
}

function getCurrentUser() {
  ensureSeed();
  return getStorage('dj_user', null);
}

function logoutLocal() {
  setStorage('dj_user', null);
}

function getWorkflow() {
  ensureSeed();
  return getStorage('dj_workflow', buildDefaultWorkflow()).map((item, index) => ({
    ...item,
    index: index + 1,
    statusText: STATUS_META[item.status].text,
    statusClassName: STATUS_META[item.status].className,
    isDone: item.status === 'approved',
  }));
}

function saveWorkflow(workflow) {
  setStorage('dj_workflow', workflow);
}

function getStep(stepCode) {
  return getWorkflow().find((item) => item.stepCode === stepCode);
}

function updateStep(stepCode, payload) {
  const workflow = getWorkflow().map((item) => {
    if (item.stepCode !== stepCode) return item;
    const nextStatus = payload.status || item.status;
    return {
      ...item,
      ...payload,
      status: nextStatus,
      statusText: STATUS_META[nextStatus].text,
      statusClassName: STATUS_META[nextStatus].className,
      isDone: nextStatus === 'approved',
      operatedAt: '2026-04-17 16:30',
    };
  });
  saveWorkflow(workflow);
  return getStep(stepCode);
}

function getProfile(userId) {
  ensureSeed();
  const user = userId ? DEMO_ACCOUNTS.find((item) => item.id === userId) : getCurrentUser();
  if (!user) return {};
  const profiles = getStorage('dj_profiles', buildDefaultProfiles());
  return profiles[user.id] || buildDefaultProfile(user);
}

function saveProfile(profile, userId) {
  const user = userId ? DEMO_ACCOUNTS.find((item) => item.id === userId) : getCurrentUser();
  if (!user) return {};
  const profiles = getStorage('dj_profiles', buildDefaultProfiles());
  const merged = { ...getProfile(user.id), ...profile };
  profiles[user.id] = merged;
  setStorage('dj_profiles', profiles);
  return merged;
}

function registerDraft(payload) {
  ensureSeed();
  const drafts = getStorage('dj_registrations', []);
  drafts.push({
    ...payload,
    createdAt: '2026-04-17 16:20',
    status: '待审核',
  });
  setStorage('dj_registrations', drafts);
}

function getDashboardData(user) {
  const workflow = getWorkflow();
  const approvedCount = workflow.filter((item) => item.status === 'approved').length;
  const reviewingCount = workflow.filter((item) => item.status === 'reviewing').length;
  const pendingCount = workflow.filter((item) => item.status === 'pending').length;
  const branchApplicantCount = DEMO_ACCOUNTS.filter((item) => item.role === 'applicant' && item.branchId === user.branchId).length;
  const orgApplicantCount = DEMO_ACCOUNTS.filter((item) => item.role === 'applicant' && item.orgId === user.orgId).length;
  const totalApplicantCount = DEMO_ACCOUNTS.filter((item) => item.role === 'applicant').length;
  let metrics = [];
  if (user.role === 'applicant') {
    metrics = [
      { label: '已完成步骤', value: approvedCount, desc: '25 步流程累计' },
      { label: '待审核事项', value: reviewingCount, desc: '当前待处理节点' },
      { label: '待填写事项', value: pendingCount, desc: '申请人可继续完善' },
      { label: '当前阶段', value: user.currentStage, desc: '发展党员流程所处阶段' },
    ];
  } else if (user.role === 'branchSecretary') {
    metrics = [
      { label: '支部申请人数', value: branchApplicantCount, desc: '本支部演示台账人数' },
      { label: '支部待审', value: 2, desc: '需支部书记处理的节点' },
      { label: '材料待补', value: 1, desc: '需督促补充的申请材料' },
      { label: '查看范围', value: user.scopeLabel, desc: user.branchName || '本支部' },
    ];
  } else if (user.role === 'organizer') {
    metrics = [
      { label: '单位申请人数', value: orgApplicantCount, desc: '本单位演示台账人数' },
      { label: '待注册审核', value: 1, desc: '首次注册待审核' },
      { label: '流程待审', value: 4, desc: '需组织员推进的节点' },
      { label: '查看范围', value: user.scopeLabel, desc: user.orgName || '本单位' },
    ];
  } else {
    metrics = [
      { label: '申请人数', value: totalApplicantCount, desc: '当前权限范围内台账人数' },
      { label: '待注册审核', value: 1, desc: '首次注册待审核' },
      { label: '待流程审核', value: 4, desc: '待审批节点数量' },
      { label: '查看范围', value: user.scopeLabel, desc: user.orgName || '系统级数据范围' },
    ];
  }
  return {
    welcome: `${user.roleLabel} · ${user.name}`,
    scopeLabel: user.scopeLabel,
    currentStage: user.currentStage,
    metrics,
  };
}

module.exports = {
  DEMO_ACCOUNTS,
  ensureSeed,
  loginLocal,
  logoutLocal,
  getCurrentUser,
  getWorkflow,
  getStep,
  updateStep,
  getProfile,
  saveProfile,
  registerDraft,
  getDashboardData,
};
