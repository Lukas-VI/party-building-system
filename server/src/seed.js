const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { query, first, raw } = require('./db');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function profileTypeForRole(roleId) {
  if (roleId === 'applicant') return 'applicant';
  if (['branchSecretary', 'organizer'].includes(roleId)) return 'cadre';
  return 'admin';
}

function profileJsonForUser(user, roleId) {
  if (roleId === 'applicant') {
    return {
      name: user[3],
      phone: '13800001234',
      education: '高中',
      degree: '无',
      unitName: user[5] === 'org-literature' ? '河南师范大学文学院' : user[5] === 'org-math' ? '河南师范大学数学与统计学院' : '河南师范大学物理学院',
      occupation: '根据学籍信息维护',
      specialty: '根据本人申报维护',
      resume: '根据档案材料完善',
      familyInfo: '根据政审材料完善',
      awards: '根据奖惩材料完善',
    };
  }
  if (['branchSecretary', 'organizer'].includes(roleId)) {
    return {
      name: user[3],
      username: user[1],
      phone: '13800004567',
      roleLabel: roleId === 'organizer' ? '组织员' : '党支部书记',
      dutySummary: roleId === 'organizer' ? '负责本单位注册审核、流程推进与联系人分配。' : '负责支部级流程审核、支部大会材料核对与导出。',
      workFocus: roleId === 'organizer' ? '重点跟进积极分子、发展对象培养与政审节点。' : '重点跟进支部大会、材料完整性和转正讨论。',
    };
  }
  return {
    name: user[3],
    username: user[1],
    phone: '13800007890',
    roleLabel: roleId === 'superAdmin' ? '超级管理员' : roleId === 'orgDept' ? '校党委组织部人员' : roleId === 'secretary' ? '二级单位党委/总支书记' : '二级单位党委/总支副书记',
    managementScope: roleId === 'superAdmin' ? '维护全局组织结构、角色权限与流程配置。' : '负责统计汇总、审核监管和组织范围内流程协调。',
    systemNote: roleId === 'superAdmin' ? '用于演示系统级配置和权限控制。' : '用于演示单位级或全校级数据监管。',
  };
}

async function runSqlFile(fileName) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'deploy', fileName), 'utf8');
  await raw(sql);
}

async function tableExists(tableName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :tableName`,
    { tableName },
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function ensureSeedData() {
  if (!(await tableExists('roles'))) {
    await runSqlFile('mysql-init.sql');
  }
  const role = await first('SELECT id FROM roles LIMIT 1');
  if (role) {
    await ensureUserProfiles();
    return;
  }

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
    ['approve_registration', '审核注册']
  ];
  for (const [id, label] of permissions) {
    await query('INSERT INTO permissions (id, label) VALUES (:id, :label)', { id, label });
  }

  const roles = [
    ['applicant', '入党申请人', 'self', ['view_workflows']],
    ['branchSecretary', '党支部书记', 'branch', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_branch', 'view_branch_stats']],
    ['secretary', '二级单位党委/总支书记', 'org', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_org', 'view_org_stats']],
    ['deputySecretary', '二级单位党委/总支副书记', 'org', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_org', 'view_org_stats']],
    ['organizer', '组织员', 'org', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_org', 'view_org_stats', 'approve_registration', 'assign_roles']],
    ['orgDept', '校党委组织部人员', 'all', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_all', 'view_org_stats', 'view_branch_stats', 'approve_registration']],
    ['superAdmin', '超级管理员', 'all', ['view_dashboard', 'view_applicants', 'view_workflows', 'review_steps', 'export_all', 'view_org_stats', 'view_branch_stats', 'manage_orgs', 'assign_roles', 'configure_workflow', 'approve_registration']]
  ];

  for (const [id, label, scopeLevel, permissionIds] of roles) {
    await query('INSERT INTO roles (id, label, scope_level) VALUES (:id, :label, :scopeLevel)', { id, label, scopeLevel });
    for (const permissionId of permissionIds) {
      await query('INSERT INTO role_permissions (role_id, permission_id) VALUES (:roleId, :permissionId)', {
        roleId: id,
        permissionId
      });
    }
  }

  const orgs = [
    ['org-literature', '文学院党委'],
    ['org-math', '数学与统计学院党委'],
    ['org-physics', '物理学院党委']
  ];
  for (const [id, name] of orgs) {
    await query('INSERT INTO org_units (id, name) VALUES (:id, :name)', { id, name });
  }

  const branches = [
    ['branch-literature-1', '文学院学生第一党支部', 'org-literature'],
    ['branch-literature-2', '文学院学生第二党支部', 'org-literature'],
    ['branch-math-1', '数学学院学生党支部', 'org-math'],
    ['branch-physics-1', '物理学院学生党支部', 'org-physics']
  ];
  for (const [id, name, orgId] of branches) {
    await query('INSERT INTO branches (id, name, org_id) VALUES (:id, :name, :orgId)', { id, name, orgId });
  }

  const users = [
    ['u-applicant-001', '2023001', '123456', 'Name', 'active', 'org-literature', 'branch-literature-1'],
    ['u-applicant-002', '2023002', '123456', 'Name', 'active', 'org-literature', 'branch-literature-2'],
    ['u-applicant-003', '2023101', '123456', 'Name', 'active', 'org-math', 'branch-math-1'],
    ['u-applicant-004', '2023201', '123456', 'Name', 'active', 'org-physics', 'branch-physics-1'],
    ['u-applicant-005', '2023202', '123456', 'Name', 'active', 'org-physics', 'branch-physics-1'],
    ['u-branch-001', 'zb001', '123456', 'Name', 'active', 'org-literature', 'branch-literature-1'],
    ['u-organizer-001', 'zz001', '123456', 'Name', 'active', 'org-literature', null],
    ['u-secretary-001', 'orgsec1', '123456', 'Name', 'active', 'org-literature', null],
    ['u-deputy-001', 'orgdep1', '123456', 'Name', 'active', 'org-literature', null],
    ['u-orgdept-001', 'org001', '123456', 'Name', 'active', null, null],
    ['u-admin-001', 'admin', '123456', 'Name', 'active', null, null]
  ];
  for (const [id, username, password, name, status, orgId, branchId] of users) {
    await query(
      `INSERT INTO users (id, username, password_hash, name, status, org_id, branch_id, created_at)
       VALUES (:id, :username, :passwordHash, :name, :status, :orgId, :branchId, :createdAt)`,
      {
        id,
        username,
        passwordHash: hashPassword(password),
        name,
        status,
        orgId,
        branchId,
        createdAt: '2026-04-17 08:00:00'
      }
    );
  }

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
    ['u-admin-001', 'superAdmin']
  ];
  for (const [userId, roleId] of userRoles) {
    await query('INSERT INTO user_roles (user_id, role_id) VALUES (:userId, :roleId)', { userId, roleId });
  }

  for (const user of users) {
    const [, , , , , orgId, branchId] = user;
    const roleId = userRoles.find((item) => item[0] === user[0])?.[1] || 'applicant';
    await query(
      `INSERT INTO user_profiles (user_id, profile_type, profile_json, updated_at)
       VALUES (:userId, :profileType, :profileJson, :updatedAt)`,
      {
        userId: user[0],
        profileType: profileTypeForRole(roleId),
        profileJson: JSON.stringify({
          ...profileJsonForUser(user, roleId),
          orgId,
          branchId,
        }),
        updatedAt: '2026-04-17 08:00:00',
      },
    );
  }

  const profiles = [
    ['u-applicant-001', '入党积极分子', '13800001234', '高中', '无', '河南师范大学文学院', '河南师范大学文学院汉语言文学专业2023级1班班长'],
    ['u-applicant-002', '发展对象', '13800004567', '高中', '无', '河南师范大学文学院', '河南师范大学文学院秘书学专业2023级1班'],
    ['u-applicant-003', '预备党员', '13800007890', '高中', '无', '河南师范大学数学与统计学院', '河南师范大学数学与应用数学专业2023级2班'],
    ['u-applicant-004', '入党申请人', '13800009999', '高中', '无', '河南师范大学物理学院', '河南师范大学物理学专业2023级1班'],
    ['u-applicant-005', '入党申请人', '13800006666', '高中', '无', '河南师范大学物理学院', '河南师范大学电子信息专业2023级2班']
  ];
  for (const [userId, currentStage, phone, education, degree, unitName, occupation] of profiles) {
    const user = users.find((item) => item[0] === userId);
    await query(
      `INSERT INTO applicant_profiles
        (user_id, current_stage, phone, education, degree, unit_name, occupation, profile_json, updated_at)
       VALUES (:userId, :currentStage, :phone, :education, :degree, :unitName, :occupation, :profileJson, :updatedAt)`,
      {
        userId,
        currentStage,
        phone,
        education,
        degree,
        unitName,
        occupation,
        profileJson: JSON.stringify({
          name: user[3],
          phone,
          education,
          degree,
          unitName,
          occupation,
          specialty: userId === 'u-applicant-001' ? '写作、演讲' : '群众工作',
          resume: '根据档案材料完善',
          familyInfo: '根据政审材料完善',
          awards: '根据奖惩材料完善'
        }),
        updatedAt: '2026-04-17 08:00:00'
      }
    );
    await query(
      'INSERT INTO workflow_instances (id, applicant_id, current_stage, updated_at) VALUES (:id, :applicantId, :currentStage, :updatedAt)',
      {
        id: `wf-${userId}`,
        applicantId: userId,
        currentStage,
        updatedAt: '2026-04-17 08:00:00'
      }
    );
  }

  await query(
    `INSERT INTO registration_requests
      (request_no, user_id, name, id_no, employee_no, status, created_at, reviewed_at)
     VALUES
      ('REG-DEMO-001', 'u-applicant-005', 'Name', '410102200505054321', '2023202', 'pending', '2026-04-17 09:30:00', NULL)`
  );

  const stepNames = [
    '递交入党申请书', '党组织派人谈话', '确定入党积极分子', '流程资格确认', '指定培养联系人',
    '培养教育考察', '确定发展对象', '确定入党介绍人', '政治审查', '短期集中培训',
    '支部委员会审查', '上级党委预审', '填写入党志愿书', '支部大会讨论', '上级党委派人谈话',
    '上级党委审批', '预备党员入党宣誓', '编入党支部和党小组', '继续教育考察', '提出转正申请',
    '支部大会讨论转正', '上级党委审批转正', '延长预备期或结项', '材料归档', '正式党员结果确认'
  ];

  for (let index = 0; index < stepNames.length; index += 1) {
    await query(
      `INSERT INTO workflow_step_definitions
        (step_code, sort_order, name, phase, allowed_roles_json, form_schema_json, start_at, end_at)
       VALUES (:stepCode, :sortOrder, :name, :phase, :allowedRolesJson, :formSchemaJson, :startAt, :endAt)`,
      {
        stepCode: `STEP_${String(index + 1).padStart(2, '0')}`,
        sortOrder: index + 1,
        name: stepNames[index],
        phase: index < 10 ? '培养考察' : index < 18 ? '接收预备党员' : '预备党员转正',
        allowedRolesJson: JSON.stringify(index < 10 ? ['applicant', 'organizer', 'branchSecretary'] : ['organizer', 'secretary', 'orgDept']),
        formSchemaJson: JSON.stringify({ fields: ['summary', 'note'], attachment: index === 0 || index === 8 }),
        startAt: '2026-04-01',
        endAt: index < 10 ? '2026-05-31' : '2026-07-31'
      }
    );
  }

  const stageProgressMap = {
    '入党申请人': 2,
    '入党积极分子': 6,
    '发展对象': 12,
    '预备党员': 20
  };

  for (const [userId, currentStage] of profiles) {
    const maxApproved = stageProgressMap[currentStage] || 1;
    for (let index = 0; index < stepNames.length; index += 1) {
      let status = 'locked';
      if (index + 1 < maxApproved) status = 'approved';
      if (index + 1 === maxApproved) status = 'reviewing';
      if (index + 1 === maxApproved + 1) status = 'pending';
      await query(
        `INSERT INTO workflow_step_records
          (instance_id, step_code, status, form_data_json, review_comment, last_operator_id, operated_at, deadline)
         VALUES (:instanceId, :stepCode, :status, :formDataJson, :reviewComment, :lastOperatorId, :operatedAt, :deadline)`,
        {
          instanceId: `wf-${userId}`,
          stepCode: `STEP_${String(index + 1).padStart(2, '0')}`,
          status,
          formDataJson: JSON.stringify({
            summary: status === 'approved' ? `${stepNames[index]} 已完成` : '',
            note: status === 'reviewing' ? '等待上级审核' : ''
          }),
          reviewComment: status === 'approved' ? '审核通过' : '',
          lastOperatorId: status === 'approved' || status === 'reviewing' ? 'u-organizer-001' : null,
          operatedAt: status === 'approved' || status === 'reviewing' ? '2026-04-16 15:20:00' : null,
          deadline: index < 10 ? '2026-05-31' : '2026-07-31'
        }
      );
    }
  }
}

async function ensureUserProfiles() {
  const users = await query(
    `SELECT
        u.id,
        u.username,
        u.name,
        u.org_id AS orgId,
        u.branch_id AS branchId,
        r.id AS roleId
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id`,
  );
  for (const user of users) {
    const existing = await first('SELECT id FROM user_profiles WHERE user_id = :userId', { userId: user.id });
    if (existing) continue;
    await query(
      `INSERT INTO user_profiles (user_id, profile_type, profile_json, updated_at)
       VALUES (:userId, :profileType, :profileJson, :updatedAt)`,
      {
        userId: user.id,
        profileType: profileTypeForRole(user.roleId),
        profileJson: JSON.stringify({
          ...profileJsonForUser([user.id, user.username, '', user.name, '', user.orgId, user.branchId], user.roleId),
          orgId: user.orgId,
          branchId: user.branchId,
        }),
        updatedAt: '2026-04-17 08:00:00',
      },
    );
  }
}

module.exports = {
  ensureSeedData
};
