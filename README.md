# 面料 ERP

## 项目介绍

面料 ERP 是一套面向纺织、服装和面料贸易企业的内部资料管理系统，用于统一管理面料基础资料、分类、供应商、颜色信息、图片和选样记录。

系统将传统 Excel 和图片资料集中到 Web 平台中，支持面料检索、详情维护、供应商关联、图片上传与缩略图展示、客户选样、标签打印、Excel 导入导出以及操作记录追踪，帮助企业减少重复录入，提升面料资料查询和协作效率。

### 主要功能

- 面料资料：Item No.、名称、规格、成分、组织结构、幅宽、克重、颜色、来源和备注等字段管理
- 分类管理：面料类别、层级分类、启用/停用和排序管理
- 供应商管理：供应商基础资料、联系方式、业务信息和面料关联
- 图片管理：JPG、PNG、WEBP 上传，自动转换为 WebP，并生成 200×200 缩略图
- 快速检索：按关键字、类别、状态和颜色筛选面料资料
- 客户选样：创建选样单、维护选样明细、作废/恢复和查询操作记录
- 标签打印：面料标签预览、批量打印记录和打印代理对接
- Excel 能力：面料资料和选样数据导入导出
- 权限控制：管理员和员工角色权限分离，成本、供应商等敏感字段按权限展示
- 审计追踪：记录面料创建、修改、状态变更、图片上传和删除等操作
- 性能优化：列表只加载首张缩略图，图片懒加载，资源缓存和数据库索引优化

### 技术架构

- 前端：React、TypeScript、Vite、Tailwind CSS
- 后端：Node.js、Express、TypeScript
- 数据库：PostgreSQL
- ORM：Prisma
- 图片处理：Sharp
- 部署：单 Docker 容器，Node.js 同时提供前端、API 和图片资源
- CI/CD：GitHub Actions 自动构建镜像并推送到 Docker Hub

生产环境使用**单 Docker 容器**：同一个容器同时提供前端页面、API 接口和 `/uploads` 图片资源。数据库使用 PostgreSQL，图片使用 Docker Volume 持久化。

## Docker Hub 镜像

GitHub Actions 会在推送到 `main` 或 `master` 分支时自动构建并推送同一个镜像的两个标签：

```text
<DOCKER_HUB_USERNAME>/fabric-erp:3.0
<DOCKER_HUB_USERNAME>/fabric-erp:latest
```

GitHub Actions 使用以下 Repository Secrets 登录 Docker Hub：

```text
DOCKER_HUB_USERNAME
DOCKER_HUB_TOKEN
```

本地不会自动向 Docker Hub 推送镜像。

## 服务器拉取并运行

### 1. 准备环境变量文件

在服务器上创建 `api.env`。不要把这个文件提交到 Git，也不要把密码写入 README。

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://用户名:密码@数据库地址:端口/数据库名?schema=public&connection_limit=10&pool_timeout=10
JWT_ACCESS_SECRET=至少32位的随机字符串
JWT_REFRESH_SECRET=另一组至少32位的随机字符串
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CORS_ORIGIN=http://服务器地址:7776
AUTH_LOGIN_RATE_LIMIT_MAX=10
AUTH_REFRESH_RATE_LIMIT_MAX=30
UPLOAD_RATE_LIMIT_MAX=30
```

`DATABASE_URL` 必须指向实际可访问的 PostgreSQL 数据库。生产环境不要使用 `localhost`，除非 PostgreSQL 和应用在同一个容器内。

### 2. 登录 Docker Hub

```bash
docker login -u "$DOCKER_HUB_USERNAME"
```

按提示输入 Docker Hub Token。也可以使用非交互方式，但不要把 Token 写进 Shell 历史或脚本：

```bash
echo "$DOCKER_HUB_TOKEN" | docker login --username "$DOCKER_HUB_USERNAME" --password-stdin
```

### 3. 拉取镜像

推荐生产环境使用固定版本标签：

```bash
docker pull "$DOCKER_HUB_USERNAME/fabric-erp:3.0"
```

如果需要始终使用最新构建版本：

```bash
docker pull "$DOCKER_HUB_USERNAME/fabric-erp:latest"
```

### 4. 创建图片数据卷

图片和缩略图必须使用持久化 Volume，删除或更新容器时不会丢失：

```bash
docker volume create fabric-erp-uploads
```

### 5. 启动单容器应用

将 `DOCKER_HUB_USERNAME` 替换为实际 Docker Hub 用户名。应用对外监听 `7776`，容器内服务监听 `0.0.0.0:3000`。

```bash
docker rm -f fabric-erp 2>/dev/null || true

docker run -d \
  --name fabric-erp \
  --restart unless-stopped \
  --env-file ./api.env \
  -p 7776:3000 \
  -v fabric-erp-uploads:/app/uploads \
  "$DOCKER_HUB_USERNAME/fabric-erp:3.0"
```

访问：

```text
http://服务器地址:7776
```

使用 `latest` 标签启动时：

```bash
docker run -d \
  --name fabric-erp \
  --restart unless-stopped \
  --env-file ./api.env \
  -p 7776:3000 \
  -v fabric-erp-uploads:/app/uploads \
  "$DOCKER_HUB_USERNAME/fabric-erp:latest"
```

## 更新线上版本

拉取新镜像后重新创建容器。图片 Volume 会继续复用，不会删除图片：

```bash
docker pull "$DOCKER_HUB_USERNAME/fabric-erp:3.0"
docker rm -f fabric-erp
docker run -d \
  --name fabric-erp \
  --restart unless-stopped \
  --env-file ./api.env \
  -p 7776:3000 \
  -v fabric-erp-uploads:/app/uploads \
  "$DOCKER_HUB_USERNAME/fabric-erp:3.0"
```

使用 `latest` 更新时，把命令中的 `3.0` 改为 `latest`。

## 运行检查

查看容器状态：

```bash
docker ps --filter name=fabric-erp
```

查看健康检查状态：

```bash
docker inspect --format='{{.State.Health.Status}}' fabric-erp
```

检查 API：

```bash
curl http://127.0.0.1:7776/health
```

正常响应示例：

```json
{"code":0,"message":"success","data":{"status":"ok"}}
```

查看日志：

```bash
docker logs -f --tail 200 fabric-erp
```

检查图片 Volume：

```bash
docker run --rm -v fabric-erp-uploads:/uploads alpine sh -c 'find /uploads -type f | wc -l'
```

## GitHub Actions 自动构建

镜像构建文件：[`Dockerfile`](Dockerfile)

工作流文件：[`.github/workflows/docker.yml`](.github/workflows/docker.yml)

README 中的 Docker 命令均为服务器拉取和运行命令；GitHub Actions 负责自动构建、打标签和推送，开发机不会执行 Docker Hub 推送。

触发条件：

- push 到 `main`
- push 到 `master`

执行内容：

1. 检出代码
2. 构建单容器 Docker 镜像
3. 登录 Docker Hub
4. 推送 `3.0` 标签
5. 推送 `latest` 标签

工作流不会在开发机执行 Docker Hub 推送，推送操作只发生在 GitHub Actions Runner 中。

## 本地构建检查

本地只构建，不推送：

```bash
docker build -f Dockerfile -t fabric-erp:local .
```

本地运行：

```bash
docker run --rm \
  --name fabric-erp-local \
  --env-file ./api.env \
  -p 7776:3000 \
  -v fabric-erp-uploads-local:/app/uploads \
  fabric-erp:local
```

## 数据和安全注意事项

- 不要提交 `api.env`、数据库密码、JWT 密钥或 Docker Hub Token。
- 不要删除 `fabric-erp-uploads` Volume，否则会删除已上传图片和缩略图。
- 生产环境建议使用 `3.0` 固定标签，确认版本后再更新；`latest` 适合测试或明确接受自动更新的环境。
- Docker Hub Token 应使用具有最小权限的 Access Token，不要使用账户登录密码。
- 服务器防火墙只开放实际需要的端口。
