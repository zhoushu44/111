import { DocumentStatus, RecordStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const labelFields = { temporaryRemark: z.string().trim().max(500).nullable().optional(), remarkMode: z.enum(['REPLACE', 'APPEND']).default('REPLACE'), copies: z.coerce.number().int().min(1).max(100).default(1), mode: z.enum(['PREVIEW', 'PRINT']).default('PREVIEW') };
const previewSchema = z.object({ materialIds: z.array(z.string().uuid()).min(1).max(500), ...labelFields }).strict();
const sampleChooseLabelSchema = z.object(labelFields).strict();
const idSchema = z.object({ id: z.string().uuid() });
router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));
function finalRemark(original: string | null | undefined, temporary: string | null | undefined, remarkMode: 'REPLACE' | 'APPEND') { if (!temporary) return original ?? null; if (remarkMode === 'REPLACE') return temporary; return [original, temporary].filter(Boolean).join('；'); }
function toLabel(material: { id: string; itemNo: string; name: string; specification: string | null; composition: string | null; width: string | null; weight: string | null; color: string | null; unit: string; labelRemark: string | null; images: { url: string }[]; provider?: { code: string; name: string } | null; cost?: unknown }, temporaryRemark: string | null | undefined, remarkMode: 'REPLACE' | 'APPEND') {
  return { qrValue: material.itemNo, data: { materialId: material.id, itemNo: material.itemNo, name: material.name, specification: material.specification, composition: material.composition, width: material.width, weight: material.weight, color: material.color, unit: material.unit, remark: finalRemark(material.labelRemark, temporaryRemark, remarkMode), imageUrl: material.images[0]?.url ?? null, ...(material.provider !== undefined ? { provider: material.provider } : {}), ...(material.cost !== undefined ? { cost: material.cost } : {}) } };
}
router.post('/preview', async (req, res, next) => { try {
  const body = previewSchema.parse(req.body); const includeSensitive = req.auth!.role === RoleCode.ADMIN;
  const materials = await prisma.materialFabric.findMany({ where: { id: { in: [...new Set(body.materialIds)] }, status: RecordStatus.ACTIVE }, include: { images: { orderBy: { sortOrder: 'asc' } }, ...(includeSensitive ? { provider: { select: { code: true, name: true } } } : {}) } });
  if (materials.length !== new Set(body.materialIds).size) throw new HttpError(400, '存在不存在或已停用的面料');
  const labels = materials.flatMap((material) => Array.from({ length: body.copies }, () => toLabel(material, body.temporaryRemark, body.remarkMode)));
  await writeOperationLog({ userId: req.auth!.userId, action: body.mode === 'PRINT' ? 'PRINT' : 'PRINT_PREVIEW', resource: 'MATERIAL_LABEL', detail: { materialIds: body.materialIds, mode: body.mode, remarkMode: body.remarkMode, copies: body.copies, totalCopies: labels.length }, ip: req.ip }); ok(res, { mode: body.mode, copies: body.copies, labels });
} catch (error) { next(error); } });
router.post('/sample-choose/:id', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params); const body = sampleChooseLabelSchema.parse(req.body); const choose = await prisma.sampleChoose.findUnique({ where: { id }, include: { items: { include: { material: { include: { images: { orderBy: { sortOrder: 'asc' } } } } } } } }); if (!choose) throw new HttpError(404, '客户选样单不存在'); if (choose.status !== DocumentStatus.ACTIVE) throw new HttpError(400, '已作废单据不可打印');
  const labels = choose.items.flatMap((item) => Array.from({ length: body.copies }, () => ({ qrValue: item.itemNoSnapshot, data: { materialId: item.materialId, itemNo: item.itemNoSnapshot, name: item.nameSnapshot, specification: item.specSnapshot, quantity: item.quantity, remark: finalRemark(item.remark, body.temporaryRemark, body.remarkMode), unit: item.material.unit, imageUrl: item.material.images[0]?.url ?? null } })));
  await writeOperationLog({ userId: req.auth!.userId, action: body.mode === 'PRINT' ? 'PRINT' : 'PRINT_PREVIEW', resource: 'SAMPLE_CHOOSE_LABEL', resourceId: id, detail: { documentNo: choose.documentNo, itemCount: choose.items.length, mode: body.mode, remarkMode: body.remarkMode, copies: body.copies, totalCopies: labels.length }, ip: req.ip }); ok(res, { documentNo: choose.documentNo, mode: body.mode, copies: body.copies, labels });
} catch (error) { next(error); } });
export default router;
