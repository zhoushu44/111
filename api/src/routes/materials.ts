import { RecordStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';
import { getAiVisionConfig, postAiJson } from '../services/ai-config.service.js';

const router = Router();
const uploadDirectory = path.resolve(process.cwd(), 'uploads', 'materials');
await mkdir(uploadDirectory, { recursive: true });
const upload = multer({ storage: multer.diskStorage({ destination: uploadDirectory, filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, callback) => { if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(new HttpError(400, '仅支持 JPG、PNG、WEBP 格式图片')); callback(null, true); } });
const statusSchema = z.nativeEnum(RecordStatus); const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), keyword: z.string().trim().max(150).optional(), itemNo: z.string().trim().min(1).max(100).optional(), color: z.string().trim().max(100).optional(), status: statusSchema.optional(), categoryId: z.string().uuid().optional(), providerId: z.string().uuid().optional() }).strict();
const commonFields = { itemNo: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(150), specification: z.string().trim().max(255).nullable().optional(), composition: z.string().trim().max(255).nullable().optional(), construction: z.string().trim().max(255).nullable().optional(), width: z.string().trim().max(100).nullable().optional(), weight: z.string().trim().max(100).nullable().optional(), color: z.string().trim().max(100).nullable().optional(), unit: z.string().trim().min(1).max(20).optional(), factoryNo: z.string().trim().max(100).nullable().optional(), fabricSource: z.string().trim().max(100).nullable().optional(), processingMethod: z.string().trim().max(100).nullable().optional(), remark: z.string().trim().max(500).nullable().optional(), labelRemark: z.string().trim().max(500).nullable().optional(), categoryId: z.string().uuid() };
const staffSchema = z.object(commonFields).strict();
const adminSchema = z.object({ ...commonFields, providerId: z.string().uuid().nullable().optional(), cost: z.coerce.number().min(0).max(9999999999.99).nullable().optional() }).strict();
const imageBodySchema = z.object({ sortOrder: z.coerce.number().int().min(0).max(999999).optional() }).strict();
const colorField = (max: number) => z.string().trim().max(max).nullable().optional();
const colorBodySchema = z.object({
  customerColorNo: colorField(100),
  color: colorField(100),
  processingColorNo: colorField(100),
  colorOverview: colorField(500),
  colorWeight: colorField(100),
  designer: colorField(100),
  providerFactory: colorField(200),
  orderCustomer: colorField(200),
  processingFee: colorField(100),
  product: colorField(200),
  sortOrder: z.coerce.number().int().min(0).max(999999).optional()
}).strict();
const colorUpdateSchema = colorBodySchema.partial();
const colorParamsSchema = z.object({ id: z.string().uuid(), colorId: z.string().uuid() });
const staffSelect = { id: true, itemNo: true, name: true, specification: true, composition: true, construction: true, width: true, weight: true, color: true, unit: true, factoryNo: true, fabricSource: true, processingMethod: true, remark: true, labelRemark: true, categoryId: true, status: true, createdAt: true, updatedAt: true, category: { select: { id: true, name: true } }, images: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } as const;
router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));

// 字段中文名映射（用于更改记录展示）
const FIELD_LABELS: Record<string, string> = {
  itemNo: 'Item No.',
  name: '产品名称',
  categoryId: '物料类别',
  unit: '单位',
  specification: '规格',
  composition: '面料成份',
  construction: '组织结构',
  width: '幅宽',
  weight: '克重',
  color: '颜色',
  factoryNo: '工厂编码',
  fabricSource: '面料来源',
  processingMethod: '加工方式',
  remark: '备注',
  labelRemark: '标签备注',
  providerId: '供应商',
  cost: '成本',
  status: '状态',
  images: '图片'
};

// 将任意值规范化为可比较字符串
function normVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

type ChangeDiff = { field: string; oldVal: unknown; newVal: unknown };

// 记录面料字段级更改：自动解析类别/供应商名称、成本格式化，并写入操作人
async function recordMaterialChanges(input: { materialId: string; userId?: string; action: string; ip?: string; diffs: ChangeDiff[] }) {
  const diffs = input.diffs.filter((d) => d.field in FIELD_LABELS && normVal(d.oldVal) !== normVal(d.newVal));
  if (diffs.length === 0) return;
  const catIds = new Set<string>();
  const provIds = new Set<string>();
  for (const d of diffs) {
    if (d.field === 'categoryId') { if (d.oldVal) catIds.add(String(d.oldVal)); if (d.newVal) catIds.add(String(d.newVal)); }
    if (d.field === 'providerId') { if (d.oldVal) provIds.add(String(d.oldVal)); if (d.newVal) provIds.add(String(d.newVal)); }
  }
  const [cats, provs, user] = await Promise.all([
    catIds.size ? prisma.materialCategory.findMany({ where: { id: { in: [...catIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
    provIds.size ? prisma.provider.findMany({ where: { id: { in: [...provIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
    input.userId ? prisma.userAccount.findUnique({ where: { id: input.userId }, select: { displayName: true } }) : Promise.resolve(null)
  ]);
  const catMap: Record<string, string> = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const provMap: Record<string, string> = Object.fromEntries(provs.map((p) => [p.id, p.name]));
  const fmt = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '';
    if (field === 'categoryId') return catMap[String(v)] ?? String(v);
    if (field === 'providerId') return provMap[String(v)] ?? String(v);
    if (field === 'status') return v === 'ACTIVE' ? '启用' : '停用';
    if (field === 'cost') return `¥ ${Number(v).toFixed(2)}`;
    return String(v);
  };
  await prisma.materialChangeLog.createMany({
    data: diffs.map((d) => ({
      materialId: input.materialId,
      userId: input.userId ?? null,
      userDisplayName: user?.displayName ?? null,
      action: input.action,
      ip: input.ip ?? null,
      field: d.field,
      fieldLabel: FIELD_LABELS[d.field],
      oldValue: fmt(d.field, d.oldVal) || null,
      newValue: fmt(d.field, d.newVal) || null
    }))
  });
}
async function validateRelations(categoryId: string, providerId?: string | null) { const category = await prisma.materialCategory.findUnique({ where: { id: categoryId } }); if (!category || category.status !== RecordStatus.ACTIVE) throw new HttpError(400, '类别不存在或已停用'); if (providerId) { const provider = await prisma.provider.findUnique({ where: { id: providerId } }); if (!provider || provider.status !== RecordStatus.ACTIVE) throw new HttpError(400, '供应商不存在或已停用'); } }
router.get('/', async (req, res, next) => { try { const query = listSchema.parse(req.query); if (req.auth!.role !== RoleCode.ADMIN && query.providerId) throw new HttpError(403, '无权按供应商查询'); const where = { ...(query.status ? { status: query.status } : {}), ...(query.itemNo ? { itemNo: { equals: query.itemNo, mode: 'insensitive' as const } } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.color ? { color: { contains: query.color, mode: 'insensitive' as const } } : {}), ...(req.auth!.role === RoleCode.ADMIN && query.providerId ? { providerId: query.providerId } : {}), ...(query.keyword ? { OR: [{ itemNo: { contains: query.keyword, mode: 'insensitive' as const } }, { name: { contains: query.keyword, mode: 'insensitive' as const } }, { specification: { contains: query.keyword, mode: 'insensitive' as const } }, { color: { contains: query.keyword, mode: 'insensitive' as const } }, { composition: { contains: query.keyword, mode: 'insensitive' as const } }, { construction: { contains: query.keyword, mode: 'insensitive' as const } }, { width: { contains: query.keyword, mode: 'insensitive' as const } }, { weight: { contains: query.keyword, mode: 'insensitive' as const } }, { factoryNo: { contains: query.keyword, mode: 'insensitive' as const } }] } : {}) }; const list = req.auth!.role === RoleCode.ADMIN ? await prisma.materialFabric.findMany({ where, include: { category: { select: { id: true, name: true } }, provider: { select: { id: true, code: true, name: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1 } }, orderBy: [{ updatedAt: 'desc' }, { itemNo: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }) : await prisma.materialFabric.findMany({ where, select: staffSelect, orderBy: [{ updatedAt: 'desc' }, { itemNo: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }); const total = await prisma.materialFabric.count({ where }); ok(res, { list, total, page: query.page, pageSize: query.pageSize }); } catch (error) { next(error); } });
router.get('/:id', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const item = req.auth!.role === RoleCode.ADMIN ? await prisma.materialFabric.findUnique({ where: { id }, include: { category: true, provider: true, images: { orderBy: { sortOrder: 'asc' } } } }) : await prisma.materialFabric.findUnique({ where: { id }, select: staffSelect }); if (!item) throw new HttpError(404, '面料不存在'); ok(res, item); } catch (error) { next(error); } });
router.get('/:id/changes', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const material = await prisma.materialFabric.findUnique({ where: { id }, select: { id: true } }); if (!material) throw new HttpError(404, '面料不存在'); const rows = await prisma.materialChangeLog.findMany({ where: { materialId: id }, orderBy: { createdAt: 'desc' }, take: 300 }); const masked = req.auth!.role !== RoleCode.ADMIN; const sensitive = (field: string | null) => field === 'providerId' || field === 'cost'; const list = rows.map((r) => ({ id: r.id, action: r.action, field: r.field, fieldLabel: r.fieldLabel, oldValue: masked && sensitive(r.field) ? '***' : r.oldValue, newValue: masked && sensitive(r.field) ? '***' : r.newValue, userDisplayName: r.userDisplayName, createdAt: r.createdAt })); ok(res, { list }); } catch (error) { next(error); } });
router.post('/', async (req, res, next) => { try { const body = req.auth!.role === RoleCode.ADMIN ? adminSchema.parse(req.body) : staffSchema.parse(req.body); const providerId = (body as { providerId?: string | null }).providerId; await validateRelations(body.categoryId, providerId); const item = await prisma.materialFabric.create({ data: body }); await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: 'MATERIAL_FABRIC', resourceId: item.id, detail: { itemNo: item.itemNo }, ip: req.ip }); await recordMaterialChanges({ materialId: item.id, userId: req.auth!.userId, action: 'CREATE', ip: req.ip, diffs: Object.keys(body).map((field) => ({ field, oldVal: '', newVal: (body as Record<string, unknown>)[field] })) }); ok(res, item, '创建成功', 201); } catch (error) { next(error); } });
router.patch('/:id', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const body = req.auth!.role === RoleCode.ADMIN ? adminSchema.partial().strict().parse(req.body) : staffSchema.partial().strict().parse(req.body); if (!Object.keys(body).length) throw new HttpError(400, '至少提供一个修改字段'); const current = await prisma.materialFabric.findUnique({ where: { id } }); if (!current) throw new HttpError(404, '面料不存在'); const providerId = (body as { providerId?: string | null }).providerId; await validateRelations(body.categoryId ?? current.categoryId, providerId === undefined ? current.providerId : providerId); const item = await prisma.materialFabric.update({ where: { id }, data: body }); await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { itemNo: item.itemNo }, ip: req.ip }); await recordMaterialChanges({ materialId: id, userId: req.auth!.userId, action: 'UPDATE', ip: req.ip, diffs: Object.keys(body).map((field) => ({ field, oldVal: (current as Record<string, unknown>)[field], newVal: (body as Record<string, unknown>)[field] })) }); ok(res, item, '修改成功'); } catch (error) { next(error); } });
router.post('/:id/toggle', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const { status } = z.object({ status: statusSchema }).strict().parse(req.body); const existing = await prisma.materialFabric.findUnique({ where: { id } }); if (!existing) throw new HttpError(404, '面料不存在'); const item = await prisma.materialFabric.update({ where: { id }, data: { status } }); await writeOperationLog({ userId: req.auth!.userId, action: 'TOGGLE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { status }, ip: req.ip }); await recordMaterialChanges({ materialId: id, userId: req.auth!.userId, action: 'TOGGLE', ip: req.ip, diffs: [{ field: 'status', oldVal: existing.status, newVal: status }] }); ok(res, item, status === RecordStatus.ACTIVE ? '已启用' : '已停用'); } catch (error) { next(error); } });
router.post('/:id/images', async (req, _res, next) => { try { const { id } = idSchema.parse(req.params); const material = await prisma.materialFabric.findUnique({ where: { id }, select: { status: true } }); if (!material) throw new HttpError(404, '面料不存在'); if (material.status !== RecordStatus.ACTIVE) throw new HttpError(400, '已停用面料不可上传图片'); next(); } catch (error) { next(error); } }, upload.single('image'), async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const body = imageBodySchema.parse(req.body); if (!req.file) throw new HttpError(400, '请选择要上传的图片'); const filename = `${randomUUID()}.webp`; const output = path.join(uploadDirectory, filename); const thumbFilename = `thumb_${filename}`; const thumbOutput = path.join(uploadDirectory, thumbFilename); await sharp(req.file.path).rotate().webp({ quality: 85, effort: 4 }).toFile(output); await sharp(req.file.path).rotate().resize(200, 200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75, effort: 4 }).toFile(thumbOutput); await unlink(req.file.path).catch(() => undefined); const image = await prisma.materialImage.create({ data: { materialId: id, url: `/uploads/materials/${filename}`, thumbnailUrl: `/uploads/materials/${thumbFilename}`, sortOrder: body.sortOrder ?? 0 } }); await writeOperationLog({ userId: req.auth!.userId, action: 'UPLOAD_IMAGE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { imageId: image.id, format: 'webp' }, ip: req.ip }); await recordMaterialChanges({ materialId: id, userId: req.auth!.userId, action: 'UPLOAD_IMAGE', ip: req.ip, diffs: [{ field: 'images', oldVal: '', newVal: '上传了图片' }] }); ok(res, image, '图片已转换为 WebP 并上传成功', 201); } catch (error) { if (req.file?.path) await unlink(req.file.path).catch(() => undefined); next(error); } });
router.delete('/:id/images/:imageId', async (req, res, next) => { try { const { id, imageId } = z.object({ id: z.string().uuid(), imageId: z.string().uuid() }).parse(req.params); const image = await prisma.materialImage.findFirst({ where: { id: imageId, materialId: id } }); if (!image) throw new HttpError(404, '图片不存在'); await prisma.materialImage.delete({ where: { id: image.id } }); if (image.url.startsWith('/uploads/materials/')) await unlink(path.join(uploadDirectory, path.basename(image.url))).catch(() => undefined); if (image.thumbnailUrl && image.thumbnailUrl.startsWith('/uploads/materials/')) await unlink(path.join(uploadDirectory, path.basename(image.thumbnailUrl))).catch(() => undefined); await writeOperationLog({ userId: req.auth!.userId, action: 'DELETE_IMAGE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { imageId }, ip: req.ip }); await recordMaterialChanges({ materialId: id, userId: req.auth!.userId, action: 'DELETE_IMAGE', ip: req.ip, diffs: [{ field: 'images', oldVal: '删除了图片', newVal: '' }] }); ok(res, null, '图片已删除'); } catch (error) { next(error); } });
// 公司颜色色子表：CRUD
router.get('/:id/colors', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const material = await prisma.materialFabric.findUnique({ where: { id }, select: { id: true } });
    if (!material) throw new HttpError(404, '面料不存在');
    const list = await prisma.materialColor.findMany({ where: { materialId: id }, orderBy: { sortOrder: 'asc' } });
    ok(res, { list });
  } catch (error) { next(error); }
});
router.post('/:id/colors', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const material = await prisma.materialFabric.findUnique({ where: { id }, select: { id: true } });
    if (!material) throw new HttpError(404, '面料不存在');
    const body = colorBodySchema.parse(req.body);
    const count = await prisma.materialColor.count({ where: { materialId: id } });
    const color = await prisma.materialColor.create({ data: { materialId: id, ...body, sortOrder: body.sortOrder ?? count } });
    await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { colorId: color.id, op: 'add_color' }, ip: req.ip });
    ok(res, color, '已新增颜色记录', 201);
  } catch (error) { next(error); }
});
router.patch('/:id/colors/:colorId', async (req, res, next) => {
  try {
    const { id, colorId } = colorParamsSchema.parse(req.params);
    const body = colorUpdateSchema.parse(req.body);
    const existing = await prisma.materialColor.findFirst({ where: { id: colorId, materialId: id } });
    if (!existing) throw new HttpError(404, '颜色记录不存在');
    const color = await prisma.materialColor.update({ where: { id: colorId }, data: body });
    ok(res, color, '已保存');
  } catch (error) { next(error); }
});
router.delete('/:id/colors/:colorId', async (req, res, next) => {
  try {
    const { id, colorId } = colorParamsSchema.parse(req.params);
    const existing = await prisma.materialColor.findFirst({ where: { id: colorId, materialId: id } });
    if (!existing) throw new HttpError(404, '颜色记录不存在');
    await prisma.materialColor.delete({ where: { id: colorId } });
    if (existing.image && existing.image.startsWith('/uploads/materials/')) await unlink(path.join(uploadDirectory, path.basename(existing.image))).catch(() => undefined);
    await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { colorId, op: 'delete_color' }, ip: req.ip });
    ok(res, null, '已删除');
  } catch (error) { next(error); }
});
// 颜色图片上传（复用面料图片的 multer + sharp 转 WebP 流程）
router.post('/:id/colors/:colorId/image', async (req, _res, next) => {
  try {
    const { id, colorId } = colorParamsSchema.parse(req.params);
    const color = await prisma.materialColor.findFirst({ where: { id: colorId, materialId: id } });
    if (!color) throw new HttpError(404, '颜色记录不存在');
    next();
  } catch (error) { next(error); }
}, upload.single('image'), async (req, res, next) => {
  try {
    const { id, colorId } = colorParamsSchema.parse(req.params);
    if (!req.file) throw new HttpError(400, '请选择要上传的图片');
    const filename = `${randomUUID()}.webp`;
    const output = path.join(uploadDirectory, filename);
    await sharp(req.file.path).rotate().webp({ quality: 85, effort: 4 }).toFile(output);
    await unlink(req.file.path).catch(() => undefined);
    const color = await prisma.materialColor.findFirst({ where: { id: colorId, materialId: id } });
    if (color?.image && color.image.startsWith('/uploads/materials/')) await unlink(path.join(uploadDirectory, path.basename(color.image))).catch(() => undefined);
    const updated = await prisma.materialColor.update({ where: { id: colorId }, data: { image: `/uploads/materials/${filename}` } });
    await writeOperationLog({ userId: req.auth!.userId, action: 'UPLOAD_IMAGE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { colorId, op: 'color_image' }, ip: req.ip });
    ok(res, updated, '颜色图片已上传', 201);
  } catch (error) { if (req.file?.path) await unlink(req.file.path).catch(() => undefined); next(error); }
});
router.delete('/:id/colors/:colorId/image', async (req, res, next) => {
  try {
    const { id, colorId } = colorParamsSchema.parse(req.params);
    const color = await prisma.materialColor.findFirst({ where: { id: colorId, materialId: id } });
    if (!color) throw new HttpError(404, '颜色记录不存在');
    if (color.image && color.image.startsWith('/uploads/materials/')) await unlink(path.join(uploadDirectory, path.basename(color.image))).catch(() => undefined);
    await prisma.materialColor.update({ where: { id: colorId }, data: { image: null } });
    await writeOperationLog({ userId: req.auth!.userId, action: 'DELETE_IMAGE', resource: 'MATERIAL_FABRIC', resourceId: id, detail: { colorId, op: 'color_image' }, ip: req.ip });
    ok(res, null, '颜色图片已删除');
  } catch (error) { next(error); }
});

// AI 视觉识别：调 OpenAI 兼容接口，返回面料特征 JSON（带 3 次重试，应对代理间歇超时）
// 配置来源：优先数据库（设置页），回退 process.env
async function recognizeFeatures(base64: string): Promise<{ color: string; texture: string; composition: string; weight: string; width: string; gloss: string }> {
  const cfg = await getAiVisionConfig();
  if (!cfg.configured) throw new HttpError(500, '尚未配置 AI 视觉识别密钥，请在「系统管理 → AI 识别设置」中配置');
  const body = {
    model: cfg.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: '识别这块面料的特征，严格返回JSON：{"color":"主色","texture":"纹理","composition":"成分","weight":"克重","width":"门幅","gloss":"光泽"}。只返回JSON，不要解释。' },
        { type: 'image_url', image_url: { url: base64 } }
      ]
    }],
    max_tokens: 150
  };
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await postAiJson(cfg.baseUrl, '/chat/completions', cfg.apiKey, body, AbortSignal.timeout(15000));
      if (!resp.ok) throw new HttpError(502, `AI 服务返回 ${resp.status}`);
      const data = await resp.json() as { choices: { message: { content: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';
      const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
      const parsed = JSON.parse(jsonStr) as { color: string; texture: string; composition: string; weight: string; width: string; gloss: string };
      return { color: parsed.color ?? '未知', texture: parsed.texture ?? '未知', composition: parsed.composition ?? '未知', weight: parsed.weight ?? '未知', width: parsed.width ?? '未知', gloss: parsed.gloss ?? '未知' };
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 800)); }
  }
  throw new HttpError(502, `AI 识别失败：${lastErr instanceof Error ? lastErr.message : '未知错误'}`);
}

// 面料库相似度匹配：字段加权打分（颜色35 + 成分25 + 纹理20 + 克重10 + 门幅10）
async function matchMaterials(f: { color: string; texture: string; composition: string; weight: string; width: string; gloss: string }) {
  const all = await prisma.materialFabric.findMany({
    where: { status: RecordStatus.ACTIVE },
    include: { category: { select: { name: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1 } }
  });
  const comp = f.composition.split(/[/,，]/)[0]?.trim() ?? '';
  const tex = f.texture.split(' ')[0]?.trim() ?? '';
  const wNum = parseFloat(f.weight);
  const wdNum = parseFloat(f.width);
  const scored = all.map((m) => {
    let score = 0;
    if (m.color && f.color) { const palette = '白蓝黑红绿黄灰青紫粉橙棕藏'; const mc = [...m.color].find((c) => palette.includes(c)); const fc = [...f.color].find((c) => palette.includes(c)); if (mc && fc && mc === fc) score += 35; }
    if (m.composition && comp && m.composition.includes(comp)) score += 25;
    if (m.construction && tex && m.construction.includes(tex)) score += 20;
    if (m.weight) { const mw = parseFloat(m.weight); if (!Number.isNaN(wNum) && !Number.isNaN(mw) && Math.abs(mw - wNum) < 30) score += 10; }
    if (m.width) { const mwd = parseFloat(m.width); if (!Number.isNaN(wdNum) && !Number.isNaN(mwd) && Math.abs(mwd - wdNum) < 10) score += 10; }
    return { ...m, similarity: Math.min(Math.round(score), 99) };
  });
  return scored.filter((m) => m.similarity >= 30).sort((a, b) => b.similarity - a.similarity).slice(0, 8);
}

// 图片智能查询：上传图片 → AI 识别特征 → 面料库相似度匹配
router.post('/image-search', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, '请上传图片');
    // 强压缩图片（resize 256 + jpeg q70），规避代理对大 base64 请求的超时
    const buf = await sharp(req.file.path).resize({ width: 256, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    const base64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
    const features = await recognizeFeatures(base64);
    const matches = await matchMaterials(features);
    await unlink(req.file.path).catch(() => undefined);
    ok(res, { features, matches });
  } catch (error) {
    if (req.file?.path) await unlink(req.file.path).catch(() => undefined);
    next(error);
  }
});

export default router;
