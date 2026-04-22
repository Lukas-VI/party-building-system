# 项目总览

## 1. 项目定位
本项目用于支撑党务管理和发展党员流程的数字化管理，当前阶段以“可部署、可联调、可继续扩展”为目标。手机端正式方向已调整为“微信服务号网页 App + PC 后台”的双端形态。

## 2. 当前项目结构
- `pages/`：历史小程序页面（保留存档）
- `utils/`：历史小程序配置、认证、接口封装
- `server/`：Node.js 服务端，负责认证、权限、流程、统计、导出、上传
- `admin-web/`：PC 后台管理端
- `admin-mobile/`：移动后台管理端（Vue3 + Vant）
- `docs/`：项目文档、图表、部署说明

## 3. 当前进展
- 已完成 PC 后台管理端基础搭建
- 已完成服务端从 SQLite 演示版向 MySQL 部署版迁移
- 已完成 JWT 鉴权和统一响应格式
- 已完成部署文件、环境变量模板和反向代理配置模板
- 已接入 Ubuntu 开发服务器作为下一阶段联调环境
- 已新增微信账号绑定的数据模型和接口骨架
- 已具备后台、服务号网页 App 与服务端的真实联调条件
- 已新增 `user_profiles`，用于存储基层管理角色和管理员资料
- 已补充管理员账号修复脚本与 `1919` 后台前端联调口径
- 已决定将桌面后台与服务号网页 App 分开构建，避免继续在桌面后台上硬做手机适配
- 已新增 `admin-mobile/`，用于承接服务号网页 App
- 已将桌面后台与服务号网页 App 分别收口到 `/web-admin/desktop/` 与 `/wx-app/`
- 已新增电子档案整理文档，明确“发展党员全程记实表”为正式电子档案主表

## 4. 需求分析
核心需求包括：
- 账号登录与首次注册
- 微信账号绑定与快捷登录
- 发展党员 25 步流程管理
- 分角色、分层级的数据权限
- PC 端台账查看、统计分析和数据下载
- 服务号网页 App 工作台、资料维护、材料上传、消息提醒与流程办理
- 发展党员全程记实表电子档案
- 附件上传、流程留痕、操作审计

## 5. 核心模块说明
- 认证模块：账号密码登录、JWT、角色菜单
- 微信模块：`wx.login` code 交换、账号绑定、快捷登录
- 档案模块：围绕《发展党员全程记实表》沉淀结构化档案字段与归档材料
- 权限模块：本人/支部/单位/全校数据范围
- 流程模块：步骤定义、步骤记录、审核提交
- 资料模块：申请人资料与管理角色资料分开建模
- 统计模块：单位统计、支部统计、阶段分布
- 导出模块：申请人台账、流程台账、统计报表
- 上传模块：附件持久化与公网 URL 返回

## 6. 数据模型
- 详细 ER 图见 [er.mmd](er.mmd)
- 数据流见 [dfd.mmd](dfd.mmd)
- 电子档案字段整理见 [electronic-dossier.md](electronic-dossier.md)

主要实体：
- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `org_units`
- `branches`
- `registration_requests`
- `applicant_profiles`
- `user_profiles`
- `workflow_instances`
- `workflow_step_definitions`
- `workflow_step_records`
- `attachments`
- `audit_logs`
- `wechat_bindings`
- `notifications`
- `notification_receipts`
- 后续将新增 `dossiers`、`dossier_entries`、`dossier_files` 等电子档案模型

## 7. 当前风险与待办
- 服务号网页 App 仍需公网 `/wx-app/` 反代路径正式接通
- MySQL 生产库初始化需单独执行
- 生产环境建议补充更强密码加密和审计策略
- 后续应补充数据库迁移工具，而不是仅依赖初始化脚本
- 服务号网页授权仍缺少真实 `AppID/AppSecret/Redirect URI` 才能联调
- 电子档案尚未真正入库，仍需完成档案主模型和字段映射
