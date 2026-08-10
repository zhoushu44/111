# 面料 ERP API

## 开发启动

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

开发种子账号：

- 管理员：`admin` / `Admin@123456`
- 员工：`staff` / `Staff@123456`

首次部署前必须替换 `.env` 中的数据库连接与 JWT 密钥；示例账号仅限开发环境使用。

## AI 视觉识别配置

图片智能查询（`POST /api/materials/image-search`）依赖 OpenAI 兼容的视觉接口。配置项：

| 变量 | 说明 |
|---|---|
| `AI_VISION_API_KEY` | API 密钥 |
| `AI_VISION_BASE_URL` | 接口根地址（系统自动拼接 `/chat/completions`） |
| `AI_VISION_MODEL` | 视觉模型名（需支持 `image_url`，如 `gpt-4o`） |

**推荐在「系统管理 → AI 识别设置」页面配置**：存入数据库，保存即生效，无需重启服务，密钥脱敏存储。`.env` 中的同名变量作为兜底（页面未配置时生效）。

相关接口（管理员权限）：

- `GET /api/system/ai-config` 读取配置（密钥脱敏回显）
- `POST /api/system/ai-config/test` 用提交的值测试连通性（不落库）
- `PUT /api/system/ai-config` 保存配置
