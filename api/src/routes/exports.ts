import { DocumentStatus, RecordStatus, RoleCode } from '@prisma/client';
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();

function colLetter(n: number): string { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const idSchema = z.object({ id: z.string().uuid() });
const chooseOptionsSchema = z.object({ includeSpec: z.coerce.boolean().default(true), includeCost: z.coerce.boolean().default(false), includeImage: z.coerce.boolean().default(false) }).strict();
const materialsSchema = z.object({ keyword: z.string().trim().max(150).optional(), color: z.string().trim().max(100).optional(), status: z.nativeEnum(RecordStatus).optional(), categoryId: z.string().uuid().optional(), providerId: z.string().uuid().optional(), includeImage: z.coerce.boolean().default(false) }).strict();
router.use(authenticate, requireRole(RoleCode.ADMIN, RoleCode.STAFF));
function download(res: Response, workbook: ExcelJS.Workbook, name: string) { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`); return workbook.xlsx.write(res).then(() => res.end()); }

// 上传的面料图片统一存为 webp，而 ExcelJS 不支持 webp 嵌入，故导出时转为 png 再嵌入。
// 这样无论原始格式（webp/png/jpg/gif）都能正确显示在产品图片列中。
async function embedImage(workbook: ExcelJS.Workbook, filePath: string): Promise<number | null> {
  try {
    const buffer = await sharp(filePath).png().toBuffer();
    return workbook.addImage({ buffer, extension: 'png' });
  } catch {
    return null;
  }
}

router.post('/sample-chooses/:id', async (req, res, next) => { try {
  const { id } = idSchema.parse(req.params); const options = chooseOptionsSchema.parse(req.body ?? {}); if (options.includeCost && req.auth!.role !== RoleCode.ADMIN) throw new HttpError(403, '员工无权导出成本');
  const choose = await prisma.sampleChoose.findUnique({ where: { id }, include: { customer: true, items: { include: { material: { include: { images: { orderBy: { sortOrder: 'asc' } } } } } } } }); if (!choose) throw new HttpError(404, '客户选样单不存在'); if (choose.status !== DocumentStatus.ACTIVE) throw new HttpError(400, '已作废单据不可导出');

  // 列定义（与打印预览一致：Item no → 规格组 → 图片 → 成本 → Remark）
  const columns = [{ key: 'itemNo', header: 'Item no', width: 18 }];
  if (options.includeSpec) columns.push(
    { key: 'composition', header: 'Composition', width: 22 },
    { key: 'construction', header: 'Construction', width: 18 },
    { key: 'width', header: 'Width', width: 12 },
    { key: 'weight', header: 'Weight', width: 12 },
  );
  const imageColIndex = columns.length + 1;
  if (options.includeImage) columns.push({ key: 'image', header: '图片', width: 14 });
  const costColIndex = columns.length + 1;
  if (options.includeCost) columns.push({ key: 'cost', header: 'COST PRICE', width: 14 });
  columns.push({ key: 'remark', header: 'Remark', width: 30 });
  const lastCol = columns.length; const lastColLetter = colLetter(lastCol);
  const HEADER_FILL = 'FF123C5A';
  const BORDER = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('客户选样');
  sheet.columns = columns;

  // 客户公司抬头（客户全称 + 地址 + TEL/FAX）
  const headerCustomer = choose.customer;
  sheet.mergeCells(`A1:${lastColLetter}1`);
  const cName = sheet.getCell(1, 1);
  cName.value = headerCustomer?.fullName || headerCustomer?.name || choose.customerName;
  cName.font = { bold: true, size: 16 };
  cName.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells(`A2:${lastColLetter}2`);
  sheet.getCell('A2').value = headerCustomer?.address ?? '';
  sheet.getCell('A2').font = { size: 9 }; sheet.getCell('A2').alignment = { horizontal: 'center' };
  sheet.mergeCells(`A3:${lastColLetter}3`);
  sheet.getCell('A3').value = `TEL: ${headerCustomer?.phone ?? '—'}   FAX: ${headerCustomer?.fax ?? '—'}`;
  sheet.getCell('A3').font = { size: 9 }; sheet.getCell('A3').alignment = { horizontal: 'center' };

  // 标题
  sheet.mergeCells(`A5:${lastColLetter}5`);
  sheet.getCell('A5').value = 'QUOTATION LIST';
  sheet.getCell('A5').font = { bold: true, size: 18 };
  sheet.getCell('A5').alignment = { horizontal: 'center' };

  // 元数据 Customer / DATE
  const d = new Date(choose.createdAt);
  const dateText = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.${d.getFullYear()}`;
  sheet.getCell('A7').value = `Customer: ${choose.customerName}`; sheet.getCell('A7').font = { bold: true };
  sheet.getCell(`${lastColLetter}7`).value = `DATE: ${dateText}`; sheet.getCell(`${lastColLetter}7`).font = { bold: true }; sheet.getCell(`${lastColLetter}7`).alignment = { horizontal: 'right' };

  // 表头（第 9 行）
  const headerRowNum = 9;
  columns.forEach((col, i) => {
    const cell = sheet.getCell(headerRowNum, i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  sheet.getRow(headerRowNum).height = 24;

  // 数据
  let rowNum = headerRowNum + 1;
  for (const item of choose.items) {
    const row = sheet.getRow(rowNum);
    const values: (string | number)[] = [item.itemNoSnapshot];
    if (options.includeSpec) values.push(
      item.compositionSnapshot ?? item.material.composition ?? '',
      item.constructionSnapshot ?? item.material.construction ?? '',
      item.widthSnapshot ?? item.material.width ?? '',
      item.weightSnapshot ?? item.material.weight ?? '',
    );
    if (options.includeImage) values.push('');
    if (options.includeCost) {
      const raw = item.material.cost;
      values.push(raw == null ? '' : Number(raw));
    }
    values.push(item.remark ?? '');
    row.values = values;
    columns.forEach((_c, i) => {
      const cell = sheet.getCell(rowNum, i + 1);
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle', horizontal: i + 1 === costColIndex ? 'right' : 'left', wrapText: i + 1 === lastCol };
      if (i + 1 === costColIndex && typeof cell.value === 'number') cell.numFmt = '0.00';
    });
    if (options.includeImage) {
      const imageUrl = item.material.images[0]?.url ?? '';
      if (imageUrl.startsWith('/uploads/')) {
        const file = path.resolve(process.cwd(), imageUrl.slice(1));
        if (existsSync(file)) {
          const imageId = await embedImage(workbook, file);
          if (imageId !== null) {
            sheet.addImage(imageId, { tl: { col: imageColIndex - 1, row: rowNum - 1 }, ext: { width: 90, height: 90 } });
            row.height = 72;
          }
        }
      }
    }
    rowNum++;
  }

  await writeOperationLog({ userId: req.auth!.userId, action: 'EXPORT', resource: 'SAMPLE_CHOOSE', resourceId: id, detail: options, ip: req.ip }); await download(res, workbook, `${choose.documentNo}.xlsx`);
} catch (error) { next(error); } });

router.get('/materials', async (req, res, next) => { try {
  const query = materialsSchema.parse(req.query); if (req.auth!.role !== RoleCode.ADMIN && query.providerId) throw new HttpError(403, '员工无权按供应商导出');
  const where = { ...(query.status ? { status: query.status as unknown as RecordStatus } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.color ? { color: { contains: query.color, mode: 'insensitive' as const } } : {}), ...(req.auth!.role === RoleCode.ADMIN && query.providerId ? { providerId: query.providerId } : {}), ...(query.keyword ? { OR: [{ itemNo: { contains: query.keyword, mode: 'insensitive' as const } }, { name: { contains: query.keyword, mode: 'insensitive' as const } }, { specification: { contains: query.keyword, mode: 'insensitive' as const } }, { color: { contains: query.keyword, mode: 'insensitive' as const } }] } : {}) };
  const materials = await prisma.materialFabric.findMany({ where, include: { category: { select: { name: true } }, ...(req.auth!.role === RoleCode.ADMIN ? { provider: { select: { name: true } } } : {}), images: { orderBy: { sortOrder: 'asc' } } }, orderBy: [{ updatedAt: 'desc' }, { itemNo: 'asc' }] });
  const admin = req.auth!.role === RoleCode.ADMIN; const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('面料资料'); sheet.columns = [{ header: 'Item No.', key: 'itemNo', width: 20 }, { header: '名称', key: 'name', width: 24 }, { header: '类别', key: 'category', width: 18 }, { header: '规格', key: 'specification', width: 26 }, { header: '成分', key: 'composition', width: 22 }, { header: '组织', key: 'construction', width: 18 }, { header: '幅宽', key: 'width', width: 14 }, { header: '克重', key: 'weight', width: 14 }, { header: '颜色', key: 'color', width: 16 }, { header: '单位', key: 'unit', width: 10 }, { header: '工厂编码', key: 'factoryNo', width: 16 }, { header: '面料来源', key: 'fabricSource', width: 16 }, { header: '加工方式', key: 'processingMethod', width: 16 }, { header: '状态', key: 'status', width: 10 }, ...(admin ? [{ header: '供应商', key: 'provider', width: 20 }, { header: '成本', key: 'cost', width: 14 }] : []), ...(query.includeImage ? [{ header: '图片', key: 'imageUrl', width: 40 }] : [])]; sheet.getRow(1).font = { bold: true };
  for (const material of materials) { const imageUrl = material.images[0]?.url ?? ''; const row = sheet.addRow({ itemNo: material.itemNo, name: material.name, category: material.category.name, specification: material.specification?.trim() || '/', composition: material.composition ?? '', construction: material.construction ?? '', width: material.width ?? '', weight: material.weight ?? '', color: material.color ?? '', unit: material.unit, factoryNo: material.factoryNo ?? '', fabricSource: material.fabricSource ?? '', processingMethod: material.processingMethod ?? '', status: material.status === RecordStatus.ACTIVE ? '启用' : '停用', provider: admin ? material.provider?.name ?? '' : undefined, cost: admin ? material.cost?.toString() ?? '' : undefined, imageUrl }); if (query.includeImage && imageUrl.startsWith('/uploads/')) { const file = path.resolve(process.cwd(), imageUrl.slice(1)); if (existsSync(file)) { const imageId = await embedImage(workbook, file); if (imageId !== null) { sheet.addImage(imageId, { tl: { col: sheet.columns.length - 1, row: row.number - 1 }, ext: { width: 80, height: 80 } }); row.height = 65; } } } }
  await writeOperationLog({ userId: req.auth!.userId, action: 'EXPORT', resource: 'MATERIAL_FABRIC', detail: query, ip: req.ip }); await download(res, workbook, '面料资料.xlsx');
} catch (error) { next(error); } });

export default router;
