# 微信服务号 API 代理部署

## 目标

测试服后端通过 VPN/frpc 暴露 API 时，主动请求微信接口的出口 IP 可能是 VPN 网关的动态 NAT IP。公众号后台的 IP 白名单会校验这个出口 IP，导致模板消息发送失败。

解决方案是在公网服务器 `39.105.127.142` 上部署 `wechat-proxy` 容器，由它负责请求微信接口。公众号后台只需要把 `39.105.127.142` 加入 IP 白名单。

## 代理接口

对外建议挂载在：

```text
https://havensky.cn/DJ-api/wechat-proxy/
```

当前只提供两个接口：

```text
GET  /health
POST /template/send
```

通过反代后对应为：

```text
GET  /DJ-api/wechat-proxy/health
POST /DJ-api/wechat-proxy/template/send
```

## 1Panel 容器配置

在 1Panel 的容器页面创建应用容器：

```text
名称：wechat-api-proxy
镜像：从本仓库 wechat-proxy/Dockerfile 构建，或上传构建后的镜像
容器端口：3011
宿主机端口：127.0.0.1:3011
重启策略：always
```

环境变量：

```text
PORT=3011
WECHAT_SERVICE_APP_ID=服务号 AppID
WECHAT_SERVICE_APP_SECRET=服务号 AppSecret
WECHAT_PROXY_TOKEN=一段足够长的随机字符串
```

容器启动后，先验证出口 IP：

```bash
curl http://127.0.0.1:3011/health
```

返回的 `outboundIp` 应为 `39.105.127.142` 或该公网服务器实际出口 IP。把这个 IP 填到公众号后台的 IP 白名单。

## OpenResty 反代

在现有 `havensky.cn` 站点里，把更具体的代理路径放在普通 `/DJ-api/` 前面：

```nginx
location ^~ /DJ-api/wechat-proxy/ {
    proxy_pass http://127.0.0.1:3011/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /DJ-api/ {
    proxy_pass http://127.0.0.1:1145/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

匹配结果：

```text
/DJ-api/wechat-proxy/template/send -> wechat-proxy 容器
/DJ-api/health                     -> 原后端
/DJ-api/auth/login                 -> 原后端
/DJ-api/wechat/oauth/start         -> 原后端
```

## 测试服后端配置

在测试服 `server/.env` 添加：

```text
WECHAT_PROXY_URL=https://havensky.cn/DJ-api/wechat-proxy/
WECHAT_PROXY_TOKEN=与代理容器一致的随机字符串
```

然后重启后端：

```bash
pm2 restart party-building-server --update-env
```

验证：

```bash
curl https://havensky.cn/DJ-api/wechat-proxy/health
curl https://havensky.cn/DJ-api/health
```

最后在系统里调用：

```text
POST /DJ-api/wechat/template-test/bind-success
```

若公众号白名单配置正确，微信应返回 `errcode: 0` 和 `msgid`。
