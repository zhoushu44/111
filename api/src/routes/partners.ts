import { RecordStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const statusSchema = z.nativeEnum(RecordStatus); const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), keyword: z.string().trim().max(150).optional(), status: statusSchema.optional() }).strict();
const bodySchema = z.object({ code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(150), contact: z.string().trim().max(100).nullable().optional(), phone: z.string().trim().max(50).nullable().optional(), address: z.string().trim().max(255).nullable().optional() }).strict();
const patchSchema = bodySchema.partial().refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');
const whereFor = (query: z.infer<typeof listSchema>) => ({ ...(query.status ? { status: query.status } : {}), ...(query.keyword ? { OR: [{ code: { contains: query.keyword, mode: 'insensitive' as const } }, { name: { contains: query.keyword, mode: 'insensitive' as const } }, { contact: { contains: query.keyword, mode: 'insensitive' as const } }, { phone: { contains: query.keyword, mode: 'insensitive' as const } }] } : {}) });
router.use(authenticate, requireRole(RoleCode.ADMIN));
function routes(prefix: '/providers' | '/customers', resource: 'PROVIDER' | 'CUSTOMER') {
  const isProvider = prefix === '/providers';
  router.get(prefix, async (req, res, next) => { try { const query = listSchema.parse(req.query); const where = whereFor(query); const [list, total] = isProvider ? await prisma.$transaction([prisma.provider.findMany({ where, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.provider.count({ where })]) : await prisma.$transaction([prisma.customer.findMany({ where, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.customer.count({ where })]); ok(res, { list, total, page: query.page, pageSize: query.pageSize }); } catch (error) { next(error); } });
  router.post(prefix, async (req, res, next) => { try { const body = bodySchema.parse(req.body); const item = isProvider ? await prisma.provider.create({ data: body }) : await prisma.customer.create({ data: body }); await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource, resourceId: item.id, detail: { code: item.code, name: item.name }, ip: req.ip }); ok(res, item, '创建成功', 201); } catch (error) { next(error); } });
  router.patch(`${prefix}/:id`, async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const body = patchSchema.parse(req.body); const exists = isProvider ? await prisma.provider.findUnique({ where: { id } }) : await prisma.customer.findUnique({ where: { id } }); if (!exists) throw new HttpError(404, '记录不存在'); const item = isProvider ? await prisma.provider.update({ where: { id }, data: body }) : await prisma.customer.update({ where: { id }, data: body }); await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource, resourceId: id, detail: body, ip: req.ip }); ok(res, item, '修改成功'); } catch (error) { next(error); } });
  router.post(`${prefix}/:id/toggle`, async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const { status } = z.object({ status: statusSchema }).strict().parse(req.body); const exists = isProvider ? await prisma.provider.findUnique({ where: { id } }) : await prisma.customer.findUnique({ where: { id } }); if (!exists) throw new HttpError(404, '记录不存在'); const item = isProvider ? await prisma.provider.update({ where: { id }, data: { status } }) : await prisma.customer.update({ where: { id }, data: { status } }); await writeOperationLog({ userId: req.auth!.userId, action: 'TOGGLE', resource, resourceId: id, detail: { status }, ip: req.ip }); ok(res, item, status === RecordStatus.ACTIVE ? '已启用' : '已停用'); } catch (error) { next(error); } });
}
routes('/providers', 'PROVIDER'); routes('/customers', 'CUSTOMER'); export default router;
