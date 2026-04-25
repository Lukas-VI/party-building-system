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

默认挂载路径：
- `/wx-app/`

统一前端入口：
- `/web-admin/` 会按设备类型分流到桌面后台或服务号网页 App

说明：
- 本目录是当前手机端主线
- 仓库中的小程序代码仅保留为历史实现，不再继续扩展

默认 API：
- `https://havensky.cn/DJ_api`
