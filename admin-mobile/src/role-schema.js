export function profileSchema(profileType) {
  if (profileType === 'applicant') {
    return [
      {
        title: '基础信息',
        fields: [
          { key: 'name', label: '姓名', type: 'text' },
          { key: 'username', label: '学号/工号', type: 'readonly' },
          { key: 'currentStage', label: '当前阶段', type: 'readonly' },
          { key: 'phone', label: '联系电话', type: 'text' },
          { key: 'unitName', label: '所在单位', type: 'text' },
          { key: 'education', label: '学历', type: 'text' },
          { key: 'degree', label: '学位', type: 'text' },
          { key: 'occupation', label: '单位、职务或职业', type: 'text' },
          { key: 'specialty', label: '有何专长', type: 'text' },
        ],
      },
      {
        title: '经历与关系',
        fields: [
          { key: 'resume', label: '本人经历', type: 'textarea' },
          { key: 'familyInfo', label: '家庭与社会关系', type: 'textarea' },
          { key: 'awards', label: '奖惩情况', type: 'textarea' },
        ],
      },
    ];
  }
  if (profileType === 'cadre') {
    return [
      {
        title: '岗位信息',
        fields: [
          { key: 'name', label: '姓名', type: 'text' },
          { key: 'username', label: '工号/账号', type: 'readonly' },
          { key: 'roleLabel', label: '当前角色', type: 'readonly' },
          { key: 'orgName', label: '所属单位', type: 'readonly' },
          { key: 'branchName', label: '所属支部', type: 'readonly' },
          { key: 'phone', label: '联系电话', type: 'text' },
        ],
      },
      {
        title: '职责说明',
        fields: [
          { key: 'dutySummary', label: '职责说明', type: 'textarea' },
          { key: 'workFocus', label: '工作重点', type: 'textarea' },
        ],
      },
    ];
  }
  return [
    {
      title: '账号信息',
      fields: [
        { key: 'name', label: '姓名', type: 'text' },
        { key: 'username', label: '工号/账号', type: 'readonly' },
        { key: 'roleLabel', label: '当前角色', type: 'readonly' },
        { key: 'scopeLabel', label: '管理范围', type: 'readonly' },
        { key: 'phone', label: '联系电话', type: 'text' },
      ],
    },
    {
      title: '系统说明',
      fields: [
        { key: 'managementScope', label: '管理范围说明', type: 'textarea' },
        { key: 'systemNote', label: '系统说明', type: 'textarea' },
      ],
    },
  ];
}
