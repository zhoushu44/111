import { DocumentStatus, RecordStatus, RoleCode } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), documentNo: z.string().trim().max(50).optional(), customer: z.string().trim().max(150).optional(), itemNo: z.string().trim().max(100).optional(), createdById: z.string().uuid().optional(), status: z.nativeEnum(DocumentStatus).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).strict().refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, '日期范围无效');
const createSchema = z.object({ customerId: z.string().uuid(), remark: z.string().trim().max(500).nullable().optional(), items: z.array(z.object({ materialId: z.string().uuid(), quantity: z.coerce.number().int().positive(), remark: z.string().trim().max(500).nullable().optional() }).strict()).min(1).max(500) }).strict();

router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));

function mergeItems(items: z.infer<typeof createSchema>['items']) {
  const merged = new Map<string, { materialId: string; quantity: number; remark?: string | null }>();
  for (const item of items) { const current = merged.get(item.materialId); merged.set(item.materialId, { materialId: item.materialId, quantity: (current?.quantity ?? 0) + item.quantity, remark: item.remark ?? current?.remark }); }
  return [...merged.values()];
}
function documentNo(prefix: string) { const now = new Date(); return `${prefix}${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(randomInt(0, 10000)).padStart(4, '0')}`; }

router.get('/operators', async (_req, res, next) => { try {
  const operators = await prisma.userAccount.findMany({ where: { sampleChooses: { some: {} } }, select: { id: true, displayName: true, username: true }, orderBy: [{ displayName: 'asc' }, { username: 'asc' }] }); ok(res, operators);
} catch (error) { next(error); } });

router.get('/', async (req, res, next) => { try {
  const query = listSchema.parse(req.query);
  const where = { ...(query.documentNo ? { documentNo: { contains: query.documentNo, mode: 'insensitive' as const } } : {}), ...(query.customer ? { customer: { name: { contains: query.customer, mode: 'insensitive' as const } } } : {}), ...(query.itemNo ? { items: { some: { itemNoSnapshot: { contains: query.itemNo, mode: 'insensitive' as const } } } } : {}), ...(query.createdById ? { createdById: query.createdById } : {}), ...(query.status ? { status: query.status } : {}), ...(query.dateFrom || query.dateTo ? { createdAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) } } : {}) };
  const [list, total] = await prisma.$transaction([prisma.sampleChoose.findMany({ where, include: { customer: { select: { id: true, code: true, name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.sampleChoose.count({ where })]);
  ok(res, { list, total, page: query.page, pageSize: query.pageSize });
} catch (error) { next(error); } });

router.get('/:id', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params);
  const item = await prisma.sampleChoose.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { id: true, username: true, displayName: true } },
      items: { orderBy: { createdAt: 'asc' }, include: { material: { select: { id: true, itemNo: true, name: true, specification: true, unit: true, images: { orderBy: { sortOrder: 'asc' } } } } } },
    },
  });
  if (!item) throw new HttpError(404, '客户选样单不存在'); ok(res, item);
} catch (error) { next(error); } });

router.post('/', async (req, res, next) => { try {
  const body = createSchema.parse(req.body); const items = mergeItems(body.items);
  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: body.customerId } });
    if (!customer || customer.status !== RecordStatus.ACTIVE) throw new HttpError(400, '客户不存在或已停用');
    const materials = await tx.materialFabric.findMany({ where: { id: { in: items.map((item) => item.materialId) }, status: RecordStatus.ACTIVE } });
    if (materials.length !== items.length) throw new HttpError(400, '存在不存在或已停用的面料');
    const materialMap = new Map(materials.map((material) => [material.id, material]));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { return await tx.sampleChoose.create({ data: { documentNo: documentNo('XZ'), customerId: customer.id, customerName: customer.name, remark: body.remark, createdById: req.auth!.userId, items: { create: items.map((item) => { const material = materialMap.get(item.materialId)!; return { materialId: material.id, itemNoSnapshot: material.itemNo, nameSnapshot: material.name, specSnapshot: material.specification, quantity: item.quantity, remark: item.remark }; }) } }, include: { customer: true, items: true } }); } catch (error: unknown) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'P2002' || attempt === 9) throw error; }
    }
    throw new HttpError(500, '单号生成失败');
  });
  await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: 'SAMPLE_CHOOSE', resourceId: created.id, detail: { documentNo: created.documentNo, itemCount: items.length }, ip: req.ip });
  ok(res, created, '创建成功', 201);
} catch (error) { next(error); } });

router.post('/:id/void', requireRole(RoleCode.ADMIN), async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params); const current = await prisma.sampleChoose.findUnique({ where: { id } }); if (!current) throw new HttpError(404, '客户选样单不存在'); if (current.status === DocumentStatus.VOIDED) throw new HttpError(400, '单据已作废');
  const item = await prisma.sampleChoose.update({ where: { id }, data: { status: DocumentStatus.VOIDED, voidedAt: new Date() } }); await writeOperationLog({ userId: req.auth!.userId, action: 'VOID', resource: 'SAMPLE_CHOOSE', resourceId: id, detail: { documentNo: item.documentNo }, ip: req.ip }); ok(res, item, '已作废');
} catch (error) { next(error); } });
router.post('/:id/restore', requireRole(RoleCode.ADMIN), async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params); const current = await prisma.sampleChoose.findUnique({ where: { id } }); if (!current) throw new HttpError(404, '客户选样单不存在'); if (current.status === DocumentStatus.ACTIVE) throw new HttpError(400, '单据当前为活动状态');
  const item = await prisma.sampleChoose.update({ where: { id }, data: { status: DocumentStatus.ACTIVE, voidedAt: null } }); await writeOperationLog({ userId: req.auth!.userId, action: 'RESTORE', resource: 'SAMPLE_CHOOSE', resourceId: id, detail: { documentNo: item.documentNo }, ip: req.ip }); ok(res, item, '已恢复');
} catch (error) { next(error); } });

export default router;
