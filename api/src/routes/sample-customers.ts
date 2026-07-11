import { RecordStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(150).optional(),
}).strict();

router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));
router.get('/', async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const where = {
      status: RecordStatus.ACTIVE,
      ...(query.keyword ? {
        OR: [
          { code: { contains: query.keyword, mode: 'insensitive' as const } },
          { name: { contains: query.keyword, mode: 'insensitive' as const } },
        ],
      } : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        select: { id: true, code: true, name: true },
        orderBy: [{ name: 'asc' }, { code: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.customer.count({ where }),
    ]);
    ok(res, { list, total, page: query.page, pageSize: query.pageSize });
  } catch (error) { next(error); }
});

export default router;
