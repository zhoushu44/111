import { Router } from 'express';
import { RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/api-response.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const roles = [
  { code: RoleCode.ADMIN, name: '管理员', permissions: ['dashboard', 'materials.categories', 'materials.fabrics', 'partners.providers', 'partners.customers', 'samples.choose', 'samples.records', 'info.material-query', 'print.labels', 'system.users', 'system.roles', 'system.dictionaries', 'system.logs'] },
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

export default router;
