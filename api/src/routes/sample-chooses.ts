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
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), documentNo: z.string().trim().max(50).optional(), customer: z.string().trim().max(150).optional(), customerId: z.string().uuid().optional(), itemNo: z.string().trim().max(100).optional(), createdById: z.string().uuid().optional(), status: z.nativeEnum(DocumentStatus).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).strict().refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, '日期范围无效');

// 选样单扩展字段（参照老系统 HSTIP 选样管理）
const extraFieldsSchema = {
  contact: z.string().trim().max(100).nullable().optional(),
  currency: z.string().trim().max(20).nullable().optional(),
  requirement: z.string().trim().max(500).nullable().optional(),
  expressNo: z.string().trim().max(100).nullable().optional(),
  expressCompany: z.string().trim().max(100).nullable().optional(),
  salesperson: z.string().trim().max(100).nullable().optional(),
  sampleType: z.string().trim().max(50).nullable().optional(),
  unsampledType: z.string().trim().max(50).nullable().optional(),
};

const itemSchema = z.object({ materialId: z.string().uuid(), quantity: z.coerce.number().int().positive(), remark: z.string().trim().max(500).nullable().optional() }).strict();
const createSchema = z.object({ customerId: z.string().uuid(), remark: z.string().trim().max(500).nullable().optional(), items: z.array(itemSchema).min(1).max(500), ...extraFieldsSchema }).strict();
const updateSchema = z.object({ customerId: z.string().uuid().optional(), remark: z.string().trim().max(500).nullable().optional(), items: z.array(itemSchema).min(1).max(500).optional(), ...extraFieldsSchema }).strict().refine((v) => Object.keys(v).length > 0, '至少提供一个修改字段');

router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));

function mergeItems(items: z.infer<typeof createSchema>['items']) {
  const merged = new Map<string, { materialId: string; quantity: number; remark?: string | null }>();
  for (const item of items) { const current = merged.get(item.materialId); merged.set(item.materialId, { materialId: item.materialId, quantity: (current?.quantity ?? 0) + item.quantity, remark: item.remark ?? current?.remark }); }
  return [...merged.values()];
}
function documentNo(prefix: string) { const now = new Date(); return `${prefix}${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(randomInt(0, 10000)).padStart(4, '0')}`; }

// 从面料记录构造明细快照数据
function buildItemCreate(materialId: string, quantity: number, remark: string | null | undefined, material: { id: string; itemNo: string; name: string; specification: string | null; unit: string; composition: string | null; width: string | null; weight: string | null; construction: string | null; factoryNo: string | null }) {
  return {
    materialId,
    itemNoSnapshot: material.itemNo,
    nameSnapshot: material.name,
    specSnapshot: material.specification,
    unitSnapshot: material.unit,
    compositionSnapshot: material.composition,
    widthSnapshot: material.width,
    weightSnapshot: material.weight,
    constructionSnapshot: material.construction,
    factoryNoSnapshot: material.factoryNo,
    quantity,
    remark: remark ?? null,
  };
}

const materialSelectForSnapshot = { id: true, itemNo: true, name: true, specification: true, unit: true, composition: true, width: true, weight: true, construction: true, factoryNo: true } as const;

router.get('/operators', async (_req, res, next) => { try {
  const operators = await prisma.userAccount.findMany({ where: { sampleChooses: { some: {} } }, select: { id: true, displayName: true, username: true }, orderBy: [{ displayName: 'asc' }, { username: 'asc' }] }); ok(res, operators);
} catch (error) { next(error); } });

router.get('/', async (req, res, next) => { try {
  const query = listSchema.parse(req.query);
  const where = { ...(query.documentNo ? { documentNo: { contains: query.documentNo, mode: 'insensitive' as const } } : {}), ...(query.customer ? { customer: { name: { contains: query.customer, mode: 'insensitive' as const } } } : {}), ...(query.customerId ? { customerId: query.customerId } : {}), ...(query.itemNo ? { items: { some: { itemNoSnapshot: { contains: query.itemNo, mode: 'insensitive' as const } } } } : {}), ...(query.createdById ? { createdById: query.createdById } : {}), ...(query.status ? { status: query.status } : {}), ...(query.dateFrom || query.dateTo ? { createdAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) } } : {}) };
  const [list, total] = await prisma.$transaction([prisma.sampleChoose.findMany({ where, include: { customer: { select: { id: true, code: true, name: true } }, createdBy: { select: { id: true, username: true, displayName: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.sampleChoose.count({ where })]);
  ok(res, { list, total, page: query.page, pageSize: query.pageSize });
} catch (error) { next(error); } });

router.get('/:id', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params);
  const item = await prisma.sampleChoose.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { id: true, username: true, displayName: true } },
      items: { orderBy: { createdAt: 'asc' }, include: { material: { select: { id: true, itemNo: true, name: true, specification: true, unit: true, composition: true, width: true, weight: true, construction: true, color: true, factoryNo: true, cost: true, images: { orderBy: { sortOrder: 'asc' } } } } } },
    },
  });
  if (!item) throw new HttpError(404, '客户选样单不存在'); ok(res, item);
} catch (error) { next(error); } });

router.post('/', async (req, res, next) => { try {
  const body = createSchema.parse(req.body); const items = mergeItems(body.items);
  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: body.customerId } });
    if (!customer || customer.status !== RecordStatus.ACTIVE) throw new HttpError(400, '客户不存在或已停用');
    const materials = await tx.materialFabric.findMany({ where: { id: { in: items.map((item) => item.materialId) }, status: RecordStatus.ACTIVE }, select: materialSelectForSnapshot });
    if (materials.length !== items.length) throw new HttpError(400, '存在不存在或已停用的面料');
    const materialMap = new Map(materials.map((material) => [material.id, material]));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { return await tx.sampleChoose.create({ data: {
        documentNo: documentNo('XZ'),
        customerId: customer.id, customerName: customer.name,
        remark: body.remark ?? null,
        contact: body.contact ?? null, currency: body.currency ?? null, requirement: body.requirement ?? null,
        expressNo: body.expressNo ?? null, expressCompany: body.expressCompany ?? null, salesperson: body.salesperson ?? null,
        sampleType: body.sampleType ?? null, unsampledType: body.unsampledType ?? null,
        createdById: req.auth!.userId,
        items: { create: items.map((item) => { const material = materialMap.get(item.materialId)!; return buildItemCreate(item.materialId, item.quantity, item.remark, material); }) },
      }, include: { customer: true, items: true } }); } catch (error: unknown) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'P2002' || attempt === 9) throw error; }
    }
    throw new HttpError(500, '单号生成失败');
  });
  await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: 'SAMPLE_CHOOSE', resourceId: created.id, detail: { documentNo: created.documentNo, itemCount: items.length }, ip: req.ip });
  ok(res, created, '创建成功', 201);
} catch (error) { next(error); } });

// 编辑选样单（仅活动状态可编辑）
router.put('/:id', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params); const body = updateSchema.parse(req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.sampleChoose.findUnique({ where: { id }, include: { customer: true, items: true } });
    if (!current) throw new HttpError(404, '客户选样单不存在');
    if (current.status !== DocumentStatus.ACTIVE) throw new HttpError(400, '已作废的选样单不可编辑');
    // 校验客户（若更换）
    let customerName = current.customerName;
    if (body.customerId && body.customerId !== current.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: body.customerId } });
      if (!customer || customer.status !== RecordStatus.ACTIVE) throw new HttpError(400, '客户不存在或已停用');
      customerName = customer.name;
    }
    // 替换明细（若提供）
    let itemCount = current.items.length;
    if (body.items) {
      const merged = mergeItems(body.items);
      const materials = await tx.materialFabric.findMany({ where: { id: { in: merged.map((item) => item.materialId) }, status: RecordStatus.ACTIVE }, select: materialSelectForSnapshot });
      if (materials.length !== merged.length) throw new HttpError(400, '存在不存在或已停用的面料');
      const materialMap = new Map(materials.map((material) => [material.id, material]));
      await tx.sampleChooseItem.deleteMany({ where: { sampleChooseId: id } });
      await tx.sampleChooseItem.createMany({ data: merged.map((item) => { const material = materialMap.get(item.materialId)!; return { sampleChooseId: id, ...buildItemCreate(item.materialId, item.quantity, item.remark, material) }; }) });
      itemCount = merged.length;
    }
    return await tx.sampleChoose.update({ where: { id }, data: {
      ...(body.customerId ? { customerId: body.customerId, customerName } : {}),
      ...(body.remark !== undefined ? { remark: body.remark ?? null } : {}),
      ...(body.contact !== undefined ? { contact: body.contact ?? null } : {}),
      ...(body.currency !== undefined ? { currency: body.currency ?? null } : {}),
      ...(body.requirement !== undefined ? { requirement: body.requirement ?? null } : {}),
      ...(body.expressNo !== undefined ? { expressNo: body.expressNo ?? null } : {}),
      ...(body.expressCompany !== undefined ? { expressCompany: body.expressCompany ?? null } : {}),
      ...(body.salesperson !== undefined ? { salesperson: body.salesperson ?? null } : {}),
      ...(body.sampleType !== undefined ? { sampleType: body.sampleType ?? null } : {}),
      ...(body.unsampledType !== undefined ? { unsampledType: body.unsampledType ?? null } : {}),
    }, include: { customer: true, items: true } });
  });
  await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'SAMPLE_CHOOSE', resourceId: id, detail: { documentNo: updated.documentNo, itemCount: updated.items.length }, ip: req.ip });
  ok(res, updated, '修改成功');
} catch (error) { next(error); } });

// 标记打印（记录打印时间）
router.post('/:id/print', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params);
  const current = await prisma.sampleChoose.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, '客户选样单不存在');
  if (current.status !== DocumentStatus.ACTIVE) throw new HttpError(400, '已作废的选样单不可打印');
  const item = await prisma.sampleChoose.update({ where: { id }, data: { printedAt: new Date() } });
  await writeOperationLog({ userId: req.auth!.userId, action: 'PRINT', resource: 'SAMPLE_CHOOSE', resourceId: id, detail: { documentNo: item.documentNo }, ip: req.ip });
  ok(res, { printedAt: item.printedAt }, '已记录打印');
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
