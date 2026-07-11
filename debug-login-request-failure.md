# Debug Session: login-request-failure
- **Status**: [OPEN]
- **Issue**: 登录页面提示“请求失败，请稍后重试”。
- **Debug Server**: 待启动
- **Log File**: .dbg/trae-debug-log-login-request-failure.ndjson

## Reproduction Steps
1. 启动前端。
2. 在登录页输入测试账号并提交。
3. 页面显示“请求失败，请稍后重试”。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 后端未监听 3000 端口 | High | Low | Pending |
| B | 后端缺少数据库或 JWT 环境变量而启动失败 | High | Low | Pending |
| C | PostgreSQL 未运行或迁移未执行 | Medium | Medium | Pending |
| D | 前端 API 基址或代理配置错误 | Low | Low | Pending |

## Log Evidence
待收集。

## Verification Conclusion
待确认。
