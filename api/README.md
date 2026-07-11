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
