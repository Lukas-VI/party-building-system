# 服务号网页 App

本目录是服务号 H5 工作台源码，技术栈为 `Vue 3 + Vite + Vant`，用于承接微信手机端和移动浏览器中的流程办理、资料维护、材料上传和消息提醒。

## 启动

```bash
npm install
npm run dev:1919
```

## 构建

```bash
npm run build
npm run preview:1919
```

## 组件预览与样式微调

本项目接入 `Storybook + Vue 3 + Vite` 作为移动端组件预览工具，用于隔离调试流程卡片、消息卡片等界面部件。它比在业务页面中临时加调试路由更符合组件驱动开发方式。

```bash
npm run storybook
```

访问：

```text
http://localhost:6006
```

当前已提供 `Mobile/Workflow Cards`，可同时预览待处理、未开放、已通过、未通过等状态。修改 `src/style.css` 后，Storybook 会热更新。

构建静态 Storybook：

```bash
npm run build-storybook
```

`storybook-static/` 是构建产物，已加入忽略规则，不纳入版本库。

默认挂载路径：
- `/wx-app/`

统一前端入口：
- `/web-admin/` 会按设备类型分流到桌面后台或服务号网页 App

说明：
- 本目录是当前手机端主线
- 仓库中的小程序代码仅保留为历史实现，不再继续扩展

默认 API：
- `https://havensky.cn/DJ_api`
