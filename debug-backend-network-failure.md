# Debug Session: backend-network-failure
- **Status**: [RESOLVED] (2026-07-29)
- **Issue**: 页面请求提示“网络连接失败，请检查服务是否启动”
- **Debug Server**: Not needed; transport-level checks supplied sufficient evidence
- **Log File**: Not created

## Reproduction Steps
1. 启动前端页面。
2. 页面按 `.env` 请求 `http://localhost:3000/api`。
3. `fetch` 在建立连接阶段失败并显示网络连接错误。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 后端 API 未启动 | High | Low | Confirmed: localhost:3000 TCP connection failed |
| B | API 基地址或端口配置错误 | High | Low | Rejected for frontend intent: `.env` and API default PORT both specify 3000 |
| C | 后端目标接口异常 | Medium | Low | Rejected at this stage: no process is listening, so request never reaches a route |
| D | 请求被代理、CORS 或网络策略拦截 | Medium | Medium | Rejected as primary cause: direct localhost TCP connection failed |

## Log Evidence
- Frontend `.env`: `VITE_API_BASE_URL=http://localhost:3000/api`.
- API config defaults to `PORT=3000`.
- `Test-NetConnection localhost -Port 3000`: `TcpTestSucceeded=False` for IPv4 and IPv6.
- `api/.env` is absent; API requires DATABASE_URL and two JWT secrets.
- PostgreSQL ports 5432 and stale PID-recorded 5433 are not listening.
- Docker CLI exists but Docker daemon is not running.

## Verification Conclusion
Pre-fix: frontend is available, but API and database are unavailable. The immediate user-visible error is caused by the missing API listener on port 3000. Starting the API requires first choosing/starting a database configuration and creating `api/.env`.

## Resolution (2026-07-29)
环境已恢复，问题不可复现：
- `api/.env` 已创建：`DATABASE_URL` 指向远程 PostgreSQL `8.163.52.51:35432/fabric_erp`，JWT 密钥已配置（≥32 字符），CORS_ORIGIN=`http://localhost:5177`。
- 远程 DB TCP 可达；3000 端口已在监听。
- `GET /health` → `{"status":"ok"}`；`POST /api/auth/login`（admin/Admin@123456）返回 accessToken/refreshToken。
- 迁移与种子已执行：`GET /api/materials` 返回种子数据（MQ-0001 全棉针织面料）。
- 前端 Vite dev server 已在 5177 启动，`@/` 别名解析正常，根页面与模块均 200。
- 注：启动时 vite 依赖预扫描会打印“@/ 别名无法解析”噪音，实际请求由 vite-tsconfig-paths 正确重写为 `/src/*`，不影响运行。
