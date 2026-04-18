function isAdminRole(role) {
  return ['orgDept', 'superAdmin'].includes(role);
}

function isCadreRole(role) {
  return ['branchSecretary', 'organizer', 'secretary', 'deputySecretary'].includes(role);
}

function isManagerRole(role) {
  return role !== 'applicant';
}

function roleGroup(role) {
  if (role === 'applicant') return 'applicant';
  if (['branchSecretary', 'organizer'].includes(role)) return 'cadre';
  if (['secretary', 'deputySecretary', 'orgDept', 'superAdmin'].includes(role)) return 'admin';
  return 'cadre';
}

function scopeLabel(user) {
  if (user.primaryRole === 'applicant') return '本人数据';
  if (user.primaryRole === 'branchSecretary') return '本支部数据';
  if (['secretary', 'deputySecretary', 'organizer'].includes(user.primaryRole)) return '本单位数据';
  return '全校数据';
}

function dashboardIntro(user) {
  const base = `${user.roleLabel || '系统角色'}当前可处理 ${scopeLabel(user)} 范围内的业务。`;
  if (user.primaryRole === 'applicant') {
    return `${base} 优先关注个人资料、材料上传和 25 步流程进度。`;
  }
  if (['branchSecretary', 'organizer'].includes(user.primaryRole)) {
    return `${base} 建议先查看待审节点，再进入后台做批量审核和导出。`;
  }
  if (['secretary', 'deputySecretary'].includes(user.primaryRole)) {
    return `${base} 重点关注单位审核、统计汇总和审批节奏。`;
  }
  return `${base} 重点关注全校统计、组织配置和流程配置。`;
}

function buildShortcuts(user) {
  const adminEntry = { title: 'PC 后台', desc: '打开后台登录页', url: '/pages/admin-webview/index' };
  switch (user.primaryRole) {
    case 'applicant':
      return [
        { title: '流程进度', desc: '查看本人 25 步流程状态', url: '/pages/workflow/index' },
        { title: '我的资料', desc: '维护申请材料与基础信息', url: '/pages/profile/index' },
        { title: '材料上传', desc: '进入步骤详情补充附件', url: '/pages/step-detail/index?stepCode=STEP_01' },
      ];
    case 'branchSecretary':
    case 'organizer':
      return [
        { title: '审核待办', desc: '进入后台查看当前待审节点', url: '/pages/admin-webview/index' },
        { title: '流程查询', desc: '进入后台查看流程总体进度', url: '/pages/admin-webview/index' },
        adminEntry,
      ];
    case 'secretary':
    case 'deputySecretary':
      return [
        { title: '单位审核', desc: '进入后台查看本单位待办事项', url: '/pages/admin-webview/index' },
        { title: '单位统计', desc: '通过后台查看单位统计结果', url: '/pages/admin-webview/index' },
        adminEntry,
      ];
    case 'orgDept':
    case 'superAdmin':
      return [
        { title: '全校统计', desc: '查看全校阶段分布与待办', url: '/pages/admin-webview/index' },
        { title: '组织配置', desc: '通过后台维护组织与角色', url: '/pages/admin-webview/index' },
        adminEntry,
      ];
    default:
      return [
        { title: '我的资料', desc: '查看当前账号资料', url: '/pages/profile/index' },
        adminEntry,
      ];
  }
}

function profileLayout(user) {
  if (roleGroup(user.primaryRole) === 'applicant') {
    return {
      profileType: 'applicant',
      intro: '用于生成发展党员材料和后续节点表单，请保持信息真实、完整且与档案一致。',
      sections: [
        {
          title: '基础信息',
          fields: [
            { key: 'name', label: '姓名', type: 'input', placeholder: '请输入姓名' },
            { key: 'username', label: '学号/工号', type: 'display' },
            { key: 'currentStage', label: '当前阶段', type: 'display' },
            { key: 'phone', label: '联系电话', type: 'input', placeholder: '请输入联系电话' },
            { key: 'unitName', label: '单位', type: 'input', placeholder: '请输入单位名称' },
            { key: 'education', label: '学历', type: 'input', placeholder: '请输入学历' },
            { key: 'degree', label: '学位', type: 'input', placeholder: '请输入学位' },
            { key: 'occupation', label: '单位、职务或职业', type: 'input', placeholder: '请输入当前身份信息' },
            { key: 'specialty', label: '有何专长', type: 'input', placeholder: '请输入专长' },
          ],
        },
        {
          title: '经历与关系',
          fields: [
            { key: 'resume', label: '本人经历', type: 'textarea', placeholder: '请按时间顺序填写本人经历' },
            { key: 'familyInfo', label: '家庭与社会关系', type: 'textarea', placeholder: '请填写家庭成员及主要社会关系' },
            { key: 'awards', label: '奖惩情况', type: 'textarea', placeholder: '请填写奖惩情况' },
          ],
        },
      ],
    };
  }

  if (roleGroup(user.primaryRole) === 'cadre') {
    return {
      profileType: 'cadre',
      intro: '用于维护基层管理角色的联络信息和职责说明，供流程流转、审核通知和台账展示使用。',
      sections: [
        {
          title: '岗位信息',
          fields: [
            { key: 'name', label: '姓名', type: 'input', placeholder: '请输入姓名' },
            { key: 'username', label: '工号/账号', type: 'display' },
            { key: 'roleLabel', label: '当前角色', type: 'display' },
            { key: 'orgName', label: '所属单位', type: 'display' },
            { key: 'branchName', label: '所属支部', type: 'display', emptyText: '未限定支部' },
            { key: 'phone', label: '联系电话', type: 'input', placeholder: '请输入联系电话' },
          ],
        },
        {
          title: '职责信息',
          fields: [
            { key: 'dutySummary', label: '职责说明', type: 'textarea', placeholder: '请填写当前角色主要职责' },
            { key: 'workFocus', label: '工作重点', type: 'textarea', placeholder: '请填写本阶段重点工作' },
          ],
        },
      ],
    };
  }

  return {
    profileType: 'admin',
    intro: '用于维护组织部和管理员账号的联络方式、管理范围和系统使用说明。',
    sections: [
      {
        title: '账号信息',
        fields: [
          { key: 'name', label: '姓名', type: 'input', placeholder: '请输入姓名' },
          { key: 'username', label: '工号/账号', type: 'display' },
          { key: 'roleLabel', label: '当前角色', type: 'display' },
          { key: 'scopeLabel', label: '管理范围', type: 'display' },
          { key: 'phone', label: '联系电话', type: 'input', placeholder: '请输入联系电话' },
        ],
      },
      {
        title: '系统说明',
        fields: [
          { key: 'managementScope', label: '管理范围说明', type: 'textarea', placeholder: '请填写负责的组织范围' },
          { key: 'systemNote', label: '系统说明', type: 'textarea', placeholder: '请填写当前账号的使用说明或备注' },
        ],
      },
    ],
  };
}

module.exports = {
  isAdminRole,
  isCadreRole,
  isManagerRole,
  roleGroup,
  scopeLabel,
  dashboardIntro,
  buildShortcuts,
  profileLayout,
};
