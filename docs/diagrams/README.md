# 后端流程与角色交互图

本目录用于沉淀服务号 H5、PC 后台、Node API 与各角色之间的信息交互图。当前同一组核心流程分别提供 Mermaid、PlantUML 和 draw.io 三种格式，方便在 Markdown、架构评审和可视化编辑器之间复用。

## 文件

- `party-development-system-context.mmd`：Mermaid 角色与服务边界图。
- `party-development-registration-sequence.mmd`：Mermaid 注册审批时序图。
- `party-development-workflow-sequence.mmd`：Mermaid 流程提交与审核时序图。
- `party-development-upload-sequence.mmd`：Mermaid 材料上传时序图。
- `party-development-notification-sequence.mmd`：Mermaid 消息通知收件人筛选时序图。
- `party-development-flows.puml`：PlantUML 版本，适合导出 PNG/SVG 或放入技术文档流水线。
- `party-development-flows.drawio`：draw.io 版本，适合人工拖拽调整。

## 图纸覆盖范围

- 系统角色与服务边界：申请人、组织员、支部书记、二级单位书记/副书记、组织部、超级管理员、H5、PC、Node API、MySQL、上传目录。
- 注册审批时序：公开注册、后台预置人员匹配、审批权限和数据范围校验、账号激活。
- 流程提交与审核时序：申请人提交、统一 actor/scope/state 校验、责任角色审核、推进下一节点或驳回锁定后续节点。
- 材料上传时序：文件存在性、材料标签、文件类型、步骤归属和数据范围校验。
- 消息通知时序：提交/审核后按责任角色和组织范围筛选收件人。

## 维护规则

- 后端权限或流程守卫调整时，优先同步对应 Mermaid 文件和 `party-development-flows.puml`。
- draw.io 文件只表达主干交互，不追求覆盖所有字段；字段级细节应继续维护在接口文档和验收报告里。
- 图中所有“守卫”均指后端强制校验，不能只依赖前端隐藏按钮。
