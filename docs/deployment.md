# 服务部署文档

## 1. 云主机要求
- Linux 云主机
- Node.js 20+
- MySQL 8.x
- Nginx 1.20+
- PM2 最新稳定版

## 2. 域名与 HTTPS
- 小程序服务端必须使用已备案并配置 HTTPS 的域名
- 后台管理端建议使用独立二级域名
- 小程序需要将 API 域名加入微信合法域名配置

示例：
- API：`https://api.your-domain.com`
- Admin：`https://admin.your-domain.com`

## 3. 数据库准备
创建数据库：
```sql
CREATE DATABASE party_building_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

初始化表结构：
```bash
mysql -u root -p party_building_app < server/deploy/mysql-init.sql
```

## 4. 服务端部署
```bash
cd /var/www/party-building/server
npm install --production
cp .env.production.example .env
pm2 start ecosystem.config.cjs
pm2 save
```

## 5. 后台部署
```bash
cd /var/www/party-building/admin-web
npm install
npm run build
```

将构建产物通过 Nginx 托管，参考：
- `server/deploy/nginx.conf.example`

## 6. 环境变量
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

## 7. 文件上传目录
- 目录建议：`/data/party-building/uploads`
- 确保 Node 进程对该目录有读写权限
- 建议定期备份上传目录

## 8. 发布与回滚
发布步骤：
1. 拉取最新代码
2. 安装依赖
3. 执行后台构建
4. 检查 `.env`
5. 重启 PM2 和 Nginx

回滚步骤：
1. 回到上一个 Git commit
2. 重新构建后台
3. 重启 PM2 和 Nginx

## 9. 生产建议
- 为 MySQL 配置定期备份
- 为上传目录配置定期备份
- 为 Nginx 和 Node 服务启用日志轮转
- 后续建议接入对象存储和更强密码哈希算法
