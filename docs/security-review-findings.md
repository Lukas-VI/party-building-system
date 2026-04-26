# 安全审查发现与分功能审查指引

本文记录当前代码审查中发现的明显安全缺陷，并给出后续按功能继续审查整个仓库的建议路径。

审查范围主要包括：
- `server/src/index.js`
- `server/src/env.js`
- `server/src/db.js`
- `admin-desktop/src/App.jsx`
- `admin-mobile/src/api.js`
- `admin-mobile/src/router.js`
- `admin-mobile/src/session.js`

验证结果：
- `server`: `npm run check` 通过
- `admin-desktop`: `npm run build` 通过
- `admin-mobile`: `npm run build` 通过

说明：构建通过只代表语法与打包链路可用，不代表权限、数据范围和业务安全边界正确。

## 1. 高优先级问题汇总

| 编号 | 等级 | 位置 | 问题 |
| --- | --- | --- | --- |
| F-01 | P0 | `server/src/index.js:868-876` | 审批注册只校验登录不校验权限 |
| F-02 | P0 | `server/src/index.js:1459-1511` | PC 流程提交和审核缺少范围与角色校验 |
| F-03 | P0 | `server/src/index.js:1590-1597` | 角色分配接口可被任意登录用户调用 |
| F-04 | P1 | `server/src/index.js:656-663` | 申请人可读取任意移动端流程 |
| F-05 | P1 | `server/src/index.js:1299-1327` | 申请人可向他人流程上传附件 |
| F-06 | P1 | `server/src/index.js:838-860` | 公共注册接口可提前重置预置账号密码 |
| F-07 | P1 | `server/src/env.js:16` | 默认 JWT 密钥和弱密码哈希不适合生产 |

## 2. 详细发现

### F-01 P0 审批注册只校验登录不校验权限

位置：`server/src/index.js:868-876`

问题描述：
`/api/auth/approve-registration` 只使用了 `requireAuth()`。接口没有检查当前用户是否拥有 `approve_registration` 权限，也没有校验审批人是否有权审批该申请所属组织或支部。

影响：
任何已登录用户都可以提交 `requestNo`，将注册申请改为 `approved`、`rejected` 或其他传入状态，导致注册审核流程被绕过。

建议修复：
- 增加统一权限守卫，例如 `requirePermission('approve_registration')`
- 根据申请记录关联的用户、组织、支部做数据范围校验
- 限制 `status` 枚举，只允许 `approved` 或 `rejected`
- 审批前确认申请当前状态为 `pending`

### F-02 P0 PC 流程提交和审核缺少范围与角色校验

位置：`server/src/index.js:1459-1511`

问题描述：
PC 端接口：
- `POST /api/workflows/:applicantId/steps/:stepCode/submit`
- `POST /api/workflows/:applicantId/steps/:stepCode/review`

这两个接口没有调用 `canAccessApplicant()`，也没有复用移动端已有的 `isApplicantActor()` 和 `isReviewerActor()` 判断。

影响：
任意登录用户只要知道 `applicantId` 和 `stepCode`，就可能提交或审核他人流程节点，破坏流程状态和审核结论。

建议修复：
- 提交流程前校验申请人只能提交自己的可提交节点
- 审核流程前校验审核人是否在当前节点责任角色中
- 统一 PC 端和移动端的流程动作权限判断，避免两套规则分叉
- 校验节点当前状态是否允许执行对应动作

### F-03 P0 角色分配接口可被任意登录用户调用

位置：`server/src/index.js:1590-1597`

问题描述：
`/api/orgs/assign-role` 只校验登录状态，未检查 `assign_roles` 权限，也未限制调用者可以给哪些用户分配哪些角色。

影响：
普通账号可以给任意 `userId` 插入任意 `roleId`，形成直接提权路径。例如把自己或他人提升为 `superAdmin`。

建议修复：
- 增加 `requirePermission('assign_roles')`
- 禁止非超级管理员分配 `superAdmin`、`orgDept` 等高权限角色
- 按调用者组织、支部范围限制可操作用户
- 对 `userId`、`roleId` 做存在性校验和审计记录

### F-04 P1 申请人可读取任意移动端流程

位置：`server/src/index.js:656-663`

问题描述：
`buildMobileWorkflow()` 当前只在 `user.primaryRole !== 'applicant'` 时调用 `canAccessApplicant()`。申请人账号访问 `/api/mobile/workflows/:workflowId` 并传入他人的 `workflowId` 时，会跳过范围校验。

影响：
申请人可能读取其他申请人的流程、手机号、组织支部、当前阶段、步骤状态和附件摘要等信息。

建议修复：
- 对申请人强制要求 `applicantId === req.user.id`
- 将流程读取权限封装为统一函数，例如 `canReadWorkflow(user, applicantId)`
- 所有移动端和 PC 端流程读取接口统一调用该函数

### F-05 P1 申请人可向他人流程上传附件

位置：`server/src/index.js:1299-1327`

问题描述：
移动端上传接口只限制了非申请人的范围。申请人传入任意 `workflowId` 和 `stepCode` 时，可以绕过 `canAccessApplicant()` 并把附件记录写入目标流程步骤。

同时，当前上传逻辑还缺少：
- `req.file` 空值校验
- 文件大小限制
- 文件类型白名单
- 上传动作与当前节点状态、材料标签的匹配校验

影响：
申请人可能污染他人流程材料；恶意或异常文件也可能被保存并通过 `/uploads` 静态目录公开访问。

建议修复：
- 对申请人强制要求只能上传本人流程材料
- 上传前校验当前用户是否是该节点允许的动作人
- 设置 `multer` 文件大小限制和 MIME/扩展名白名单
- 校验 `materialTag` 是否属于该步骤材料清单
- 对 `req.file` 为空的请求返回 400

### F-06 P1 公共注册接口可提前重置预置账号密码

位置：`server/src/index.js:838-860`

问题描述：
`/api/auth/register` 是公开接口。只要知道某个预置人员的 `employeeNo`，并传入 `password`，接口就会立即更新该用户的 `password_hash`，不需要等注册申请审批通过。

影响：
攻击者可以抢先设置他人账号密码。即使当前账号状态未激活，也会造成账号认领和后续审批风险。

建议修复：
- 注册申请提交时不要直接写入 `users.password_hash`
- 将待设置密码临时保存到注册申请记录中，审批通过后再激活
- 检查同一用户是否已有 `pending` 或 `approved` 注册申请
- 增加身份证号、姓名、工号等字段与预置用户的匹配校验
- 对注册接口增加频率限制和失败审计

### F-07 P1 默认 JWT 密钥和弱密码哈希不适合生产

位置：`server/src/env.js:16`、`server/src/index.js:57-58`

问题描述：
`JWT_SECRET` 默认值是 `change-this-secret`。密码哈希使用裸 SHA-256，没有盐，也没有成本因子。

影响：
如果生产环境漏配 `JWT_SECRET`，攻击者可能伪造登录令牌。数据库泄露后，裸 SHA-256 也更容易被离线撞库。

建议修复：
- 生产环境启动时强制要求配置高强度 `JWT_SECRET`
- 使用 `bcrypt`、`argon2` 或同类密码哈希方案
- 为旧 SHA-256 密码提供渐进式迁移逻辑：登录成功后重哈希
- 明确区分开发种子账号和生产账号策略

## 3. 建议优先修复顺序

1. 先补统一权限守卫：
   - `requirePermission(permissionId)`
   - `requireApplicantAccess(paramName)`
   - `requireWorkflowActor(action)`

2. 立即保护高危写接口：
   - `/api/auth/approve-registration`
   - `/api/workflows/:applicantId/steps/:stepCode/submit`
   - `/api/workflows/:applicantId/steps/:stepCode/review`
   - `/api/orgs/assign-role`

3. 修复移动端越权读取与上传：
   - `/api/mobile/workflows/:workflowId`
   - `/api/mobile/files/upload`

4. 调整注册账号认领流程：
   - 注册申请只写申请表
   - 审核通过后再写入密码和激活状态

5. 强化生产配置：
   - 生产环境禁止默认密钥
   - 引入强密码哈希
   - 检查 CORS、上传目录、公开静态资源策略

## 4. 分功能审查整个仓库的指引

### 4.1 认证与权限

重点文件：
- `server/src/index.js`
- `server/src/seed.js`
- `server/src/env.js`

审查重点：
- 所有写接口是否不仅校验登录，还校验权限
- 权限是否和 `roles`、`permissions` 表保持一致
- 数据范围是否覆盖申请人、支部、单位、全校四类角色
- 前端菜单隐藏是否没有被误当成后端权限

### 4.2 注册、登录与微信绑定

重点接口：
- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/approve-registration`
- `/api/wechat/*`

审查重点：
- 注册申请是否能冒领他人账号
- 密码是否在审批前被写入正式用户表
- 微信绑定是否能被重复绑定或抢绑
- OAuth 回调是否有 state 校验和 redirect 限制

### 4.3 流程办理与 25 步状态机

重点文件：
- `server/src/index.js`
- `server/src/workflow-config.js`

审查重点：
- 每一步的提交人、审核人、责任角色是否明确
- 状态流转是否只能从合法状态进入下一个状态
- PC 端和移动端是否复用同一套权限规则
- 驳回、补交、改期、确认等特殊动作是否有状态保护

### 4.4 材料、附件与上传

重点接口：
- `/api/files/upload`
- `/api/mobile/files/upload`
- `/uploads`

审查重点：
- 上传文件是否限制大小和类型
- 附件是否绑定到用户有权操作的流程节点
- 静态文件 URL 是否会公开敏感材料
- 是否需要下载鉴权或短期签名链接

### 4.5 组织、人员与角色管理

重点接口：
- `/api/users`
- `/api/orgs`
- `/api/branches`
- `/api/orgs/import-staff`
- `/api/orgs/assign-role`

审查重点：
- 通讯录是否对低权限用户暴露过多
- 角色分配是否按组织范围限制
- 导入人员是否校验字段、重复数据和异常角色
- 是否能给自己或他人授予更高权限

### 4.6 统计与导出

重点接口：
- `/api/stats/overview`
- `/api/stats/by-org`
- `/api/stats/by-branch`
- `/api/export/applicants`
- `/api/export/workflows`
- `/api/export/stats`

审查重点：
- 导出是否遵守数据范围
- 导出字段是否包含身份证号、手机号等敏感信息
- Excel 是否存在公式注入风险
- 大数据量导出是否会阻塞服务

### 4.7 PC 管理端

重点文件：
- `admin-desktop/src/App.jsx`
- `admin-desktop/src/deviceRoute.js`

审查重点：
- 菜单权限与后端权限是否一致
- 审核、角色分配、流程配置等按钮是否依赖后端强校验
- localStorage token 风险是否可接受
- 演示账号和默认密码是否只在开发环境出现

### 4.8 服务号网页 App

重点文件：
- `admin-mobile/src/api.js`
- `admin-mobile/src/router.js`
- `admin-mobile/src/session.js`
- `admin-mobile/src/views/*.vue`

审查重点：
- 路由参数中的 `workflowId` 是否可能造成越权
- 申请人与审核者页面是否只展示可操作数据
- 上传、提交、审核动作是否都由后端最终裁决
- 401 处理、会话清理和微信内跳转是否稳定

### 4.9 部署与运行配置

重点文件：
- `server/.env.example`
- `server/.env.production.example`
- `server/deploy/nginx.conf.example`
- `server/deploy/frpc.toml.example`
- `scripts/*`

审查重点：
- 生产环境是否强制配置密钥、数据库密码和 HTTPS 域名
- CORS 是否只允许可信来源
- Nginx 是否正确代理 `/DJ_api/`、`/admin-desktop/`、`/wx-app/`
- 上传目录是否有备份、清理和访问控制策略

## 5. 建议整改完成标准

每个高危问题修复后至少满足：
- 有后端权限守卫或明确的数据范围校验
- 有非法角色、非法范围、非法状态的失败用例
- 对关键写操作保留审计日志
- 前端按钮隐藏只是体验优化，不作为唯一保护
- 重新执行：
  - `server`: `npm run check`
- `admin-desktop`: `npm run build`
  - `admin-mobile`: `npm run build`
