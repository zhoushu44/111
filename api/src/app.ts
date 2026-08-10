import path from 'node:path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { ok } from './lib/api-response.js';
import authRouter from './routes/auth.js';
import systemRouter from './routes/system.js';
import categoriesRouter from './routes/categories.js';
import partnersRouter from './routes/partners.js';
import sampleCustomersRouter from './routes/sample-customers.js';
import dictionariesRouter from './routes/dictionaries.js';
import materialsRouter from './routes/materials.js';
import usersRouter from './routes/users.js';
import sampleChoosesRouter from './routes/sample-chooses.js';
import exportsRouter from './routes/exports.js';
import labelsRouter from './routes/labels.js';
import { errorHandler } from './middleware/error-handler.js';

export const app = express();
const rateLimitError = (_req: express.Request, res: express.Response) => res.status(429).json({ code: 429, message: '请求过于频繁，请稍后再试', data: null });
const createLimiter = (
  max: number,
  keyGenerator?: (req: express.Request, res: express.Response) => string,
) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitError,
    ...(keyGenerator ? { keyGenerator } : {}),
  });

// 登录限流按「客户端 IP + 账号」分别计数：开发环境下前端经 Vite 代理访问后端，
// 所有请求的客户 IP 都是 127.0.0.1，若仅按 IP 计数会导致不同账号/浏览器共享同一个
// 限流桶而互相误伤。按账号分别计数既符合防暴力破解的语义，又避免该问题。
const loginKeyGenerator = (req: express.Request): string => {
  const body = (req.body ?? {}) as { username?: string; account?: string };
  const account = body.username ?? body.account ?? 'unknown';
  return `${ipKeyGenerator(req.ip ?? 'unknown')}:${account}`;
};
const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
app.set('trust proxy', 1);

// 产品图片静态目录（/uploads）必须在 helmet 之前挂载：否则 helmet 会为这些响应
// 附加 Cross-Origin-Resource-Policy: same-origin（以及 CSP），浏览器在跨源加载图片
// （如前端直接使用绝对 VITE_API_BASE_URL 直连后端）时会被拦截，表现为缩略图裂图。
// 这里显式允许跨源加载图片（内部 ERP，图片本身不含可执行内容）。
app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'uploads'), {
    maxAge: '30d',
    immutable: true,
    setHeaders(res) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

// helmet 默认 CSP 含 upgrade-insecure-requests，会把 HTTP 页面内的图片/接口请求
// 强制升级为 HTTPS。部署环境可能只有 HTTP（如 192.6.121.16:7776），升级后请求全部
// 失败导致图片裂图、页面白屏。这里关闭该指令，兼容 HTTP 与 HTTPS 两种访问方式；
// HSTS 仅在 HTTPS 响应中生效，不影响 HTTP 访问，故保留。
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(compression());
app.use(cors({ origin: corsOrigins.length ? corsOrigins : false, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => ok(res, { status: 'ok' }));
app.use('/api/auth/login', createLimiter(env.AUTH_LOGIN_RATE_LIMIT_MAX, loginKeyGenerator));
app.use('/api/auth/refresh', createLimiter(env.AUTH_REFRESH_RATE_LIMIT_MAX, (req) => ipKeyGenerator(req.ip ?? 'unknown')));
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api', partnersRouter);
app.use('/api/sample-customers', sampleCustomersRouter);
app.use('/api/dictionaries', dictionariesRouter);
app.use('/api/materials/:id/images', createLimiter(env.UPLOAD_RATE_LIMIT_MAX));
app.use('/api/materials', materialsRouter);
app.use('/api/sample-chooses', sampleChoosesRouter);
app.use('/api/exports', exportsRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/system/users', usersRouter);
app.use('/api/system', systemRouter);

const webDirectory = path.resolve(process.cwd(), 'web');
app.use(express.static(webDirectory, { maxAge: '30d', immutable: true, index: false }));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(webDirectory, 'index.html'));
    return;
  }
  next();
});
app.use((_req, res) => res.status(404).json({ code: 404, message: '接口不存在', data: null }));
app.use(errorHandler);
