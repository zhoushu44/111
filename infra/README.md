# 正式部署（Docker Compose）

本目录部署 API、PostgreSQL、Nginx 与 Let's Encrypt 证书。所有命令在 `infra` 目录执行；不要将 `infra/.env`、`api/.env` 或备份文件提交到仓库。

## 1. 前置条件

1. 安装 Docker Engine 与 Compose 插件，并确保服务器安全组/防火墙放行 TCP `80`、`443`；数据库端口不要对公网开放。
2. 在 DNS 将 `DOMAIN` 的 A/AAAA 记录指向本服务器公网 IP。签发前等待解析生效，并保证 80 端口未被其他服务占用。
3. 创建配置：复制 `infra/.env.example` 为 `infra/.env`，填写真实域名、强随机 `POSTGRES_PASSWORD` 和可接收通知的 `CERTBOT_EMAIL`；复制 `api/.env.example` 为 `api/.env`，填写同一个数据库密码、至少 32 字符且彼此不同的 JWT 密钥、实际 `CORS_ORIGIN` 与限流值。

## 2. 构建前端

在项目根目录配置生产 API 地址（例如 `VITE_API_BASE_URL=https://erp.example.com/api`），然后执行：

```powershell
npm ci
npm run build
```

构建产物必须位于项目根目录 `dist/`，由 Nginx 以只读方式挂载。

## 3. 首次签发证书

Nginx 的 HTTPS 配置依赖已签发的证书，因此**首次签发不要先启动 nginx**。确认 DNS 与 80 端口后，运行一次 standalone Certbot：

```powershell
$env:DOMAIN=(Get-Content .env | Where-Object { $_ -match '^DOMAIN=' }).Split('=',2)[1]
$env:CERTBOT_EMAIL=(Get-Content .env | Where-Object { $_ -match '^CERTBOT_EMAIL=' }).Split('=',2)[1]
docker compose --profile certbot run --rm --service-ports certbot certonly --standalone --non-interactive --agree-tos --email $env:CERTBOT_EMAIL -d $env:DOMAIN
```

该命令不会声称或保证签发成功；失败时应先检查 DNS、80 端口占用及 CA 限额。证书和 ACME webroot 都保存在命名卷中。签发完成后再启动服务：

```powershell
docker compose up -d --build
```

Nginx 配置通过官方镜像的模板机制将 `${DOMAIN}` 写入 `/etc/nginx/templates/default.conf.template`；`NGINX_ENVSUBST_FILTER=DOMAIN` 避免替换 Nginx 的 `$host` 等变量。HTTP 仅保留 ACME challenge，其余请求跳转 HTTPS。HSTS 默认注释：确认域名（含所有子域）永久只通过 HTTPS 提供后，取消 `nginx.conf` 中相应行的注释并重建 Nginx。

## 4. 数据库迁移与 seed

首次启动或发布包含迁移时，**单独**执行：

```powershell
docker compose --profile migrate run --rm migrate
```

迁移服务使用 API Dockerfile 的 `build` 阶段，其中保留 Prisma CLI；API 正常启动不会自动迁移。确认命令成功后再发布应用。`prisma db seed` 仅用于开发/测试，正式库不得执行，以免写入演示数据。

## 5. 发布、续期与备份

发布/更新：先构建前端，执行迁移，再运行 `docker compose up -d --build`。查看状态和日志：`docker compose ps`、`docker compose logs -f api nginx`。

证书续期在到期前执行（可由系统计划任务每周运行）：

```powershell
docker compose run --rm certbot renew --webroot -w /var/www/certbot
docker compose exec nginx nginx -s reload
```

续期时 Nginx 必须运行并占用 80 端口，以便 webroot 验证。备份至少包括 PostgreSQL 逻辑导出、`postgres_data` 卷、`upload_data` 卷及 `letsencrypt` 卷；备份须加密、异地保存并定期在隔离环境恢复演练。示例：`docker compose exec -T postgres pg_dump -U erp fabric_erp > backup.sql`；导出文件含敏感业务数据，应限制权限。

## 6. 三地验收清单

- **公网/DNS**：`http://域名/.well-known/acme-challenge/不存在文件` 可达但普通 HTTP 自动跳转 HTTPS；证书域名、链路和续期正常。
- **浏览器客户端**：HTTPS 无混合内容；SPA 刷新任意业务路由正常；登录、API 跨域、上传和静态资源缓存正常。
- **服务器/数据层**：`https://域名/health` 正常；容器仅暴露 80/443；迁移已成功且未执行 seed；重启后上传文件和数据库数据仍在，备份可恢复。
