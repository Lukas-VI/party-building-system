# P0 整改执行规范

本文记录当前阶段采用的整改方法，用于约束安全缺陷、前 12 步 MVP 和可维护性问题的后续处理。

## 1. 工作原则

- 先定义成功标准，再修改代码。
- 只改当前验收路径，不顺手重构无关模块。
- 每个高危缺陷必须有失败场景、修复点和验证命令。
- 前端隐藏按钮只作为体验优化，不能替代后端权限校验。
- 每次阶段整改结束都要保留可运行状态。

## 2. 当前验收边界

- 移动端：`admin-mobile/` 服务号网页 App，挂载路径 `/wx-app/`。
- PC 端：`admin-web/` 桌面后台，挂载路径 `/web-admin/desktop/`。
- 后端：`server/` Node API。
- 流程：第一阶段只验收前 12 步 MVP 办理闭环。
- 不再维护小程序入口、页面或依赖。

## 3. P0 缺陷处理清单

| 项 | 成功标准 | 失败场景 |
| --- | --- | --- |
| 注册审批 | 只有拥有 `approve_registration` 且覆盖申请人范围的用户可审批 pending 申请 | 申请人或跨单位用户审批应返回 `403` |
| PC 流程提交 | 只有申请人本人可提交本人当前可提交节点 | 任意登录用户提交他人节点应返回 `403` |
| PC 流程审核 | 只有责任角色可审核范围内当前待审节点 | 非责任角色或跨范围审核应返回 `403` |
| 角色分配 | 只有 `assign_roles` 用户可分配范围内普通角色；高权限角色仅 `superAdmin` 可分配 | 普通用户分配角色、组织员分配 `superAdmin` 应返回 `403` |
| 小程序残留 | 主仓库路径不再存在小程序入口、页面和依赖 | 搜索 `pages/`、`miniprogram_npm`、`jscode2session` 不应命中主代码 |

## 4. 前 12 步 MVP 规则

- `STEP_01` 到 `STEP_12` 是当前可办理范围。
- `STEP_13` 及以后保留为流程定义，但不进入移动端待办，也不允许提交或审核。
- 当前节点办理前必须满足上一 MVP 节点已通过。
- 申请人提交只允许 `pending` 或 `rejected` 状态。
- 审核人审核只允许 `pending` 或 `reviewing` 状态。
- 审核通过后打开下一 MVP 节点。
- 审核驳回后阻断后续未完成节点。
- 上传材料必须校验流程归属、步骤归属、材料标签和文件类型。

## 5. 每轮验证命令

```bash
cd server && npm run check
cd admin-web && npm run build
cd admin-mobile && npm run build
```

辅助搜索：

```bash
Select-String -Path README.md,docs\*.md,server\src\*.js,admin-mobile\src\*.js,admin-mobile\src\views\*.vue -Pattern "jscode2session|bind/start|bind/confirm|wechat/login|miniprogram|app\.json|project\.config"
```
