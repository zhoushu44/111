import { RecordStatus, RoleCode } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const itemSchema = z.object({ materialId: z.string().uuid(), locationId: z.string().uuid(), quantity: z.coerce.number().int().positive() }).strict();
const documentSchema = z.object({ remark: z.string().trim().max(500).nullable().optional(), items: z.array(itemSchema).min(1).max(500) }).strict();
const stockListSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), materialId: z.string().uuid().optional(), locationId: z.string().uuid().optional(), keyword: z.string().trim().max(150).optional(), stockStatus: z.enum(['IN_STOCK', 'OUT_OF_STOCK']).optional() }).strict();
const transactionSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), type: z.enum(['IN', 'OUT']).optional(), materialId: z.string().uuid().optional(), locationId: z.string().uuid().optional(), keyword: z.string().trim().max(150).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).strict().refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, '日期范围无效');
router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));

function mergeItems(items: z.infer<typeof documentSchema>['items']) { const merged = new Map<string, z.infer<typeof itemSchema>>(); for (const item of items) { const key = `${item.materialId}:${item.locationId}`; const previous = merged.get(key); merged.set(key, { ...item, quantity: item.quantity + (previous?.quantity ?? 0) }); } return [...merged.values()]; }
function documentNo(prefix: string) { const now = new Date(); return `${prefix}${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(randomInt(0, 10000)).padStart(4, '0')}`; }
async function validateItems(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], items: z.infer<typeof itemSchema>[]) {
  const [materials, locations] = await Promise.all([tx.materialFabric.findMany({ where: { id: { in: [...new Set(items.map((item) => item.materialId))] }, status: RecordStatus.ACTIVE } }), tx.sampleLocation.findMany({ where: { id: { in: [...new Set(items.map((item) => item.locationId))] }, status: RecordStatus.ACTIVE } })]);
  if (materials.length !== new Set(items.map((item) => item.materialId)).size) throw new HttpError(400, '存在不存在或已停用的面料'); if (locations.length !== new Set(items.map((item) => item.locationId)).size) throw new HttpError(400, '存在不存在或已停用的库位');
}

router.get('/sample-stocks', async (req, res, next) => { try {
  const query = stockListSchema.parse(req.query); const where = { ...(query.materialId ? { materialId: query.materialId } : {}), ...(query.locationId ? { locationId: query.locationId } : {}), ...(query.stockStatus === 'IN_STOCK' ? { quantity: { gt: 0 } } : query.stockStatus === 'OUT_OF_STOCK' ? { quantity: 0 } : {}), ...(query.keyword ? { material: { OR: [{ itemNo: { contains: query.keyword, mode: 'insensitive' as const } }, { name: { contains: query.keyword, mode: 'insensitive' as const } }] } } : {}) };
  const [list, total, summary] = await prisma.$transaction([prisma.sampleStock.findMany({ where, include: { material: { select: { id: true, itemNo: true, name: true, specification: true, unit: true } }, location: { select: { id: true, code: true, name: true } } }, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.sampleStock.count({ where }), prisma.sampleStock.aggregate({ where, _sum: { quantity: true }, _count: true })]);
  ok(res, { list, total, page: query.page, pageSize: query.pageSize, summary: { stockRecordCount: summary._count, totalQuantity: summary._sum.quantity ?? 0 } });
} catch (error) { next(error); } });

async function createDocument(req: Request, res: Response, next: NextFunction, type: 'IN' | 'OUT') { try {
  const body = documentSchema.parse(req.body); const items = mergeItems(body.items); const created = await prisma.$transaction(async (tx) => {
    await validateItems(tx, items);
    if (type === 'OUT') for (const item of items) { const updated = await tx.sampleStock.updateMany({ where: { materialId: item.materialId, locationId: item.locationId, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } }); if (updated.count !== 1) throw new HttpError(400, '库存不足'); }
    for (let attempt = 0; attempt < 10; attempt += 1) try {
      if (type === 'IN') { const document = await tx.sampleIn.create({ data: { documentNo: documentNo('RK'), remark: body.remark, createdById: req.auth!.userId, items: { create: items } }, include: { items: true } }); for (const item of items) await tx.sampleStock.upsert({ where: { materialId_locationId: { materialId: item.materialId, locationId: item.locationId } }, create: { ...item }, update: { quantity: { increment: item.quantity } } }); return document; }
      return await tx.sampleOut.create({ data: { documentNo: documentNo('CK'), remark: body.remark, createdById: req.auth!.userId, items: { create: items } }, include: { items: true } });
    } catch (error: unknown) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'P2002' || attempt === 9) throw error; }
    throw new HttpError(500, '单号生成失败');
  });
  await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: type === 'IN' ? 'SAMPLE_IN' : 'SAMPLE_OUT', resourceId: created.id, detail: { documentNo: created.documentNo, itemCount: items.length }, ip: req.ip }); ok(res, created, '创建成功', 201);
} catch (error) { next(error); } }
router.post('/sample-inbounds', (req, res, next) => createDocument(req, res, next, 'IN'));
router.post('/sample-outbounds', (req, res, next) => createDocument(req, res, next, 'OUT'));

router.get('/sample-transactions', async (req, res, next) => { try {
  const query = transactionSchema.parse(req.query); const dateWhere = query.dateFrom || query.dateTo ? { createdAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) } } : {}; const itemWhere = { ...(query.materialId ? { materialId: query.materialId } : {}), ...(query.locationId ? { locationId: query.locationId } : {}), ...(query.keyword ? { material: { OR: [{ itemNo: { contains: query.keyword, mode: 'insensitive' as const } }, { name: { contains: query.keyword, mode: 'insensitive' as const } }] } } : {}) };
  const [ins, outs] = await Promise.all([query.type === 'OUT' ? [] : prisma.sampleIn.findMany({ where: { ...dateWhere, items: { some: itemWhere } }, include: { createdBy: { select: { id: true, username: true, displayName: true } }, items: { where: itemWhere, include: { material: { select: { id: true, itemNo: true, name: true, unit: true } }, location: { select: { id: true, code: true, name: true } } } } } }), query.type === 'IN' ? [] : prisma.sampleOut.findMany({ where: { ...dateWhere, items: { some: itemWhere } }, include: { createdBy: { select: { id: true, username: true, displayName: true } }, items: { where: itemWhere, include: { material: { select: { id: true, itemNo: true, name: true, unit: true } }, location: { select: { id: true, code: true, name: true } } } } } })]);
  const list = [...ins.map((item) => ({ ...item, type: 'IN' as const })), ...outs.map((item) => ({ ...item, type: 'OUT' as const }))].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); const total = list.length; ok(res, { list: list.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total, page: query.page, pageSize: query.pageSize });
} catch (error) { next(error); } });
export default router;
