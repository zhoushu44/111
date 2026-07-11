import { RecordStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const statusSchema = z.nativeEnum(RecordStatus);
const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), keyword: z.string().trim().max(100).optional(), status: statusSchema.optional() }).strict();
const bodySchema = z.object({ code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(100) }).strict();
const patchSchema = bodySchema.partial().refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');

router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));
router.get('/', async (req, res, next) => { try {
  const query = listSchema.parse(req.query); const where = { ...(query.status ? { status: query.status } : {}), ...(query.keyword ? { OR: [{ code: { contains: query.keyword, mode: 'insensitive' as const } }, { name: { contains: query.keyword, mode: 'insensitive' as const } }] } : {}) };
  const [list, total] = await prisma.$transaction([prisma.sampleLocation.findMany({ where, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.sampleLocation.count({ where })]); ok(res, { list, total, page: query.page, pageSize: query.pageSize });
} catch (error) { next(error); } });
router.post('/', async (req, res, next) => { try {
  const item = await prisma.sampleLocation.create({ data: bodySchema.parse(req.body) }); await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: 'SAMPLE_LOCATION', resourceId: item.id, detail: { code: item.code, name: item.name }, ip: req.ip }); ok(res, item, '创建成功', 201);
} catch (error) { next(error); } });
router.patch('/:id', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params); const body = patchSchema.parse(req.body); if (!await prisma.sampleLocation.findUnique({ where: { id } })) throw new HttpError(404, '库位不存在'); const item = await prisma.sampleLocation.update({ where: { id }, data: body }); await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'SAMPLE_LOCATION', resourceId: id, detail: body, ip: req.ip }); ok(res, item, '修改成功');
} catch (error) { next(error); } });
router.post('/:id/toggle', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params); const { status } = z.object({ status: statusSchema }).strict().parse(req.body); if (!await prisma.sampleLocation.findUnique({ where: { id } })) throw new HttpError(404, '库位不存在'); const item = await prisma.sampleLocation.update({ where: { id }, data: { status } }); await writeOperationLog({ userId: req.auth!.userId, action: 'TOGGLE', resource: 'SAMPLE_LOCATION', resourceId: id, detail: { status }, ip: req.ip }); ok(res, item, status === RecordStatus.ACTIVE ? '已启用' : '已停用');
} catch (error) { next(error); } });
export default router;
