# 服务部署文档

## 1. 云主机要求
- Linux 云主机
- Node.js 20+
- MySQL 8.x
- Nginx 1.20+
- PM2 最新稳定版

当前开发联调环境的具体机器信息不在本文件中维护。
如需查看，请查阅：
- [开发调试记录](dev-notes.md)

## 2. 域名与 HTTPS
- 微信服务号网页 App 和服务端必须使用已备案并配置 HTTPS 的域名
- 对外保留两个正式入口：前端统一入口 `/web-admin/`，后端 API 入口 `/DJ_api/`
- `/wx-app/` 和 `/admin-desktop/` 是统一前端网关内部真实挂载路径，用于设备分流和静态资源加载

示例：
- API：`https://havensky.cn/DJ_api`
- 前端统一入口：`https://havensky.cn/web-admin/`
- 桌面后台真实挂载：`https://havensky.cn/admin-desktop/`
- 服务号网页 App 真实挂载：`https://havensky.cn/wx-app/`

开发联调阶段可先使用：
- 可先使用局域网开发服务器进行联调
- 微信内真机测试仍需 HTTPS 合法域名

## 3. 数据库准备
创建数据库：
```sql
CREATE DATABASE party_building_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

初始化表结构：
```bash
mysql -u root -p party_building_app < server/deploy/mysql-init.sql
```

如需开发环境专用账号，建议：
```sql
CREATE USER 'party_building_user'@'127.0.0.1' IDENTIFIED BY 'replace-me';
GRANT ALL PRIVILEGES ON party_building_app.* TO 'party_building_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

## 4. 服务端部署
```bash
cd /var/www/party-building/server
npm install --production
cp .env.production.example .env
pm2 start ecosystem.config.cjs
pm2 save
```

开发服务器建议先执行：
```bash
apt-get update
apt-get install -y nginx
npm install -g pm2
```

当前开发服务器可用性状态请记录在单独调试文档中。

## 5. 桌面后台构建
```bash
cd /var/www/party-building/admin-desktop
npm install
npm run build
```

桌面后台构建资源基址固定为：
- `/admin-desktop/`

## 6. 服务号网页 App 构建
```bash
cd /var/www/party-building/admin-mobile
npm install
npm run build
```

服务号网页 App 构建资源基址固定为：
- `/wx-app/`

## 7. 统一后台网关
为避免桌面后台与服务号网页 App 分散暴露，仓库根目录提供统一前端网关脚本：

```bash
node scripts/serve-admin-frontends.mjs
```

该脚本会：
- 在 `1919` 端口同时托管 `/admin-desktop/` 与 `/wx-app/`
- 自动将 `/web-admin/` 按设备类型分流
- 不再保留 `/admin/`、`/m-admin/`、`/web-admin/mobile/` 等旧入口

公网服务器推荐反代规则：
- `/DJ_api/` -> `http://127.0.0.1:1145/api/`
- `/web-admin/` -> `http://127.0.0.1:1919/web-admin/`
- `/wx-app/` -> `http://127.0.0.1:1919/wx-app/`

## 8. 环境变量
- `PORT`：服务端监听端口
- `NODE_ENV`：运行环境
- `JWT_SECRET`：JWT 签名密钥
- `DB_HOST`：MySQL 主机
- `DB_PORT`：MySQL 端口
- `DB_NAME`：数据库名
- `DB_USER`：数据库用户名
- `DB_PASSWORD`：数据库密码
- `UPLOAD_DIR`：上传文件存储目录
- `PUBLIC_BASE_URL`：服务公网访问地址
- `CORS_ORIGINS`：允许访问后台的前端域名
- `WECHAT_APP_ID`：兼容旧微信绑定流程的 AppID
- `WECHAT_APP_SECRET`：兼容旧微信绑定流程的 AppSecret
- `WECHAT_SERVICE_APP_ID`：服务号网页授权 AppID
- `WECHAT_SERVICE_APP_SECRET`：服务号网页授权 AppSecret
- `WECHAT_SERVICE_REDIRECT_URI`：服务号网页授权回调地址
- `WECHAT_SESSION_SECRET`：微信 session_key 加密密钥

## 9. 开发环境修复命令
重置演示/开发管理员账号：
```bash
cd server
npm run reset-admin
```

默认会重置为：
- 用户名：`admin`
- 密码：`123456`

## 10. frp 端口规划
- `1145 -> 3000`：服务端 API 穿透
- `1919 -> 1919`：服务号网页 App / 统一前端网关联调穿透
- 示例文件：`server/deploy/frpc.toml.example`
- 数据库不建议通过 frp 暴露；Navicat 推荐走 VMware NAT、内网白名单或 SSH 隧道

## 11. 文件上传目录
- 目录建议：`/data/party-building/uploads`
- 确保 Node 进程对该目录有读写权限
- 建议定期备份上传目录

## 12. 发布与回滚
发布步骤：
1. 拉取最新代码
2. 安装依赖
3. 执行后台构建
4. 检查 `.env`
5. 重启 PM2 和 Nginx

如果 Ubuntu 服务器无法直接访问 GitHub，可改用“本机打包同步”的方式发布：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-to-ubuntu.ps1
```

该脚本会：
- 从本机当前已提交分支生成 git bundle
- 通过 SSH/SCP 同步到 Ubuntu
- 在 Ubuntu 上更新 `main` 与当前分支引用
- 强制将 Ubuntu 仓库远程保持为 GitHub
- 自动执行 `scripts/start-ubuntu-services.sh`

对应的 Bash 版本脚本：

```bash
bash ./scripts/deploy-to-ubuntu.sh
```

回滚步骤：
1. 回到上一个 Git commit
2. 重新构建后台
3. 重启 PM2 和 Nginx

## 13. 生产建议
- 为 MySQL 配置定期备份
- 为上传目录配置定期备份
- 为 Nginx 和 Node 服务启用日志轮转
- 后续建议接入对象存储和更强密码哈希算法

## 14. 开发服务器清理记录
具体清理记录已迁移到独立调试文档，仅保留项目部署说明。
