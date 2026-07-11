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
const bodySchema = z.object({ name: z.string().trim().min(1).max(100), parentId: z.string().uuid().nullable().optional(), sortOrder: z.number().int().min(0).max(999999).optional() }).strict();
const patchSchema = bodySchema.partial().refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');
const toggleSchema = z.object({ status: statusSchema }).strict();

router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));

async function validateParent(parentId: string | null | undefined, currentId?: string) {
  if (!parentId) return;
  if (parentId === currentId) throw new HttpError(400, '类别不能设置自身为父级');
  let parent = await prisma.materialCategory.findUnique({ where: { id: parentId } });
  if (!parent || parent.status !== RecordStatus.ACTIVE) throw new HttpError(400, '父级类别不存在或已停用');
  while (parent.parentId) {
    if (parent.parentId === currentId) throw new HttpError(400, '类别不能设置为自身后代的子级');
    parent = await prisma.materialCategory.findUnique({ where: { id: parent.parentId } });
    if (!parent) throw new HttpError(400, '父级类别不存在');
  }
}

router.get('/', async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const where = { ...(query.status ? { status: query.status } : {}), ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' as const } } : {}) };
    const [list, total] = await prisma.$transaction([prisma.materialCategory.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { parent: { select: { id: true, name: true } } } }), prisma.materialCategory.count({ where })]);
    ok(res, { list, total, page: query.page, pageSize: query.pageSize });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const body = bodySchema.parse(req.body);
    await validateParent(body.parentId);
    const item = await prisma.materialCategory.create({ data: body });
    await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: 'MATERIAL_CATEGORY', resourceId: item.id, detail: { name: item.name }, ip: req.ip });
    ok(res, item, '创建成功', 201);
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params); const body = patchSchema.parse(req.body);
    const current = await prisma.materialCategory.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, '类别不存在');
    if (body.parentId !== undefined) await validateParent(body.parentId, id);
    const item = await prisma.materialCategory.update({ where: { id }, data: body });
    await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'MATERIAL_CATEGORY', resourceId: id, detail: body, ip: req.ip });
    ok(res, item, '修改成功');
  } catch (error) { next(error); }
});

router.post('/:id/toggle', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params); const { status } = toggleSchema.parse(req.body);
    const current = await prisma.materialCategory.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, '类别不存在');
    const item = await prisma.materialCategory.update({ where: { id }, data: { status } });
    await writeOperationLog({ userId: req.auth!.userId, action: 'TOGGLE', resource: 'MATERIAL_CATEGORY', resourceId: id, detail: { status }, ip: req.ip });
    ok(res, item, status === RecordStatus.ACTIVE ? '已启用' : '已停用');
  } catch (error) { next(error); }
});

export default router;
