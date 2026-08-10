import { Router } from 'express';
import { z } from 'zod';
import { RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/api-response.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getAiVisionConfig, saveAiVisionConfig, testAiVision, maskKey } from '../services/ai-config.service.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const roles = [
  { code: RoleCode.ADMIN, name: '管理员', permissions: ['dashboard', 'materials.categories', 'materials.fabrics', 'partners.providers', 'partners.customers', 'samples.choose', 'samples.records', 'info.material-query', 'print.labels', 'system.users', 'system.roles', 'system.dictionaries', 'system.ai-config', 'system.logs'] },
  { code: RoleCode.STAFF, name: '员工', permissions: ['dashboard', 'materials.categories', 'materials.fabrics', 'samples.choose', 'samples.records', 'info.material-query', 'print.labels'] },
] as const;
router.use(authenticate, requireRole(RoleCode.ADMIN));

router.get('/roles', (_req, res) => ok(res, roles));
router.get('/operation-logs', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const [list, total] = await prisma.$transaction([
      prisma.operationLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { username: true, displayName: true } } } }),
      prisma.operationLog.count(),
    ]);
    ok(res, { list, total, page, pageSize });
  } catch (error) { next(error); }
});

// ---- AI 视觉识别配置 ----
const aiConfigSchema = z.object({
  apiKey: z.string().max(255),
  baseUrl: z.string().max(255),
  model: z.string().max(255),
}).strict();

// 读取配置：密钥脱敏回显，避免泄露
router.get('/ai-config', async (_req, res, next) => {
  try {
    const cfg = await getAiVisionConfig();
    ok(res, {
      maskedKey: maskKey(cfg.apiKey),
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      configured: cfg.configured,
    });
  } catch (error) { next(error); }
});

// 测试配置连通性（用前端提交的值，不落库）
router.post('/ai-config/test', async (req, res, next) => {
  try {
    const body = aiConfigSchema.parse(req.body);
    const result = await testAiVision(body);
    ok(res, result);
  } catch (error) { next(error); }
});

// 保存配置（upsert）
router.put('/ai-config', async (req, res, next) => {
  try {
    const body = aiConfigSchema.parse(req.body);
    await saveAiVisionConfig(body);
    await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'AI_CONFIG', detail: { model: body.model }, ip: req.ip });
    ok(res, null, '保存成功');
  } catch (error) { next(error); }
});

export default router;
