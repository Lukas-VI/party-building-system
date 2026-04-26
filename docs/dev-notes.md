# 开发调试记录

本文件用于记录开发联调阶段的关键调试信息，不属于项目介绍文档。

## 当前开发服务器
- Ubuntu（VMware NAT）
- 地址：`192.168.31.135`
- 用途：后台与 API 联调服务器

## 当前联调入口
- 后台入口：`http://192.168.31.135`
- API 健康检查：`http://192.168.31.135/api/health`

## 当前开发约束
- 服务号网页 App 正式联调需要 HTTPS 合法域名
- 微信网页授权真实联调需要填写服务号 `AppID/AppSecret/Redirect URI`

## 当前模式说明
- 服务号网页 App、后台和服务端默认使用 Ubuntu 开发服务器

## 调试说明
- 若需重新部署后台静态资源，在 Ubuntu 上重新执行 `admin-desktop` 构建并覆盖 Nginx 根目录

## 最近一次故障处理
- 现象：后台页面可打开，但登录请求返回 500
- 根因：开发服务器 `server/.env` 被示例值覆盖，导致 `CORS_ORIGINS` 缺少后台来源；旧版 CORS 处理又把拒绝请求直接抛成了 500
- 处理：
  - 服务端增加 `ALLOW_ALL_CORS` 开关
  - 开发环境默认允许跨源联调
  - Ubuntu 上恢复实际 `.env`，重新写入数据库、上传目录和 `PUBLIC_BASE_URL`
  - 重启 `party-building-server` 并重新部署后台静态资源
- 当前结果：`/api/health` 与 `/api/auth/login` 已恢复正常
