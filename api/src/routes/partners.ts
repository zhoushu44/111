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
// suppliers 扩展后的字段集合
const providerBodySchema = z.object({
  // 基本资料
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  chineseShortName: z.string().trim().max(100).nullable().optional(),
  shortName: z.string().trim().max(100).nullable().optional(),
  fullName: z.string().trim().max(200).nullable().optional(),
  type: z.string().trim().max(50).nullable().optional(),
  businessType: z.string().trim().max(100).nullable().optional(),
  businessUnit: z.string().trim().max(150).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  isMonthlySettlement: z.boolean().nullable().optional(),
  isSilkSupplier: z.boolean().nullable().optional(),
  merchandiser: z.string().trim().max(100).nullable().optional(),
  paymentDays: z.number().int().min(0).nullable().optional(),
  invoiceDays: z.number().int().min(0).nullable().optional(),
  mainProducts: z.string().trim().max(500).nullable().optional(),
  equipmentCapacity: z.string().trim().max(500).nullable().optional(),
  // 联系方式
  contact: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  mobile: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  otherContacts: z.string().trim().max(500).nullable().optional(),
  // 开票资料
  bankName: z.string().trim().max(150).nullable().optional(),
  bankAccount: z.string().trim().max(100).nullable().optional(),
  invoiceNo: z.string().trim().max(100).nullable().optional(),
  taxId: z.string().trim().max(50).nullable().optional(),
  invoiceRatio: z.number().min(0).max(100).nullable().optional(),
  invoiceNote: z.string().trim().max(500).nullable().optional(),
  registeredAddress: z.string().trim().max(255).nullable().optional(),
}).strict();
// customers 客户档案完整字段（与老式 ERP 客户资料维护页一致）
const customerBodySchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  // 基本资料
  shortName: z.string().trim().max(100).nullable().optional(),
  fullName: z.string().trim().max(200).nullable().optional(),
  type: z.string().trim().max(50).nullable().optional(),
  intermediary: z.string().trim().max(100).nullable().optional(),
  businessType: z.string().trim().max(100).nullable().optional(),
  salesman: z.string().trim().max(100).nullable().optional(),
  businessUnit: z.string().trim().max(150).nullable().optional(),
  brandName: z.string().trim().max(150).nullable().optional(),
  registeredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$|^\d{4}\/\d{2}\/\d{2}$/).nullable().optional(),
  // 业务信息
  monthlySettlement: z.boolean().nullable().optional(),
  paymentDays: z.number().int().min(0).nullable().optional(),
  creditLimit: z.number().min(0).nullable().optional(),
  mainProducts: z.string().trim().max(500).nullable().optional(),
  remark: z.string().trim().max(500).nullable().optional(),
  // 联系地址
  country: z.string().trim().max(50).nullable().optional(),
  province: z.string().trim().max(50).nullable().optional(),
  city: z.string().trim().max(50).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  shippingAddress: z.string().trim().max(255).nullable().optional(),
  // 联系人
  contact: z.string().trim().max(100).nullable().optional(),
  generalManager: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  mobile: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().max(100).nullable().optional(),
  fax: z.string().trim().max(50).nullable().optional(),
  otherContacts: z.string().trim().max(500).nullable().optional(),
}).strict();
const bodySchema = providerBodySchema;
const providerPatchSchema = providerBodySchema.partial().refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');
const customerPatchSchema = customerBodySchema.partial().refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');
const patchSchema = providerPatchSchema;
const whereFor = (query: z.infer<typeof listSchema>, isProvider: boolean) => {
  if (!query.keyword) return query.status ? { status: query.status } : {};
  const kw = query.keyword;
  const mode = 'insensitive' as const;
  const contains = { contains: kw, mode };
  // provider 与 customer 字段不同，分别构造 OR，避免传给 Prisma 不存在的列
  const providerOR = [
    { code: contains }, { name: contains }, { chineseShortName: contains }, { shortName: contains }, { fullName: contains },
    { contact: contains }, { phone: contains }, { mobile: contains }, { email: contains },
    { merchandiser: contains }, { city: contains }, { businessUnit: contains },
  ];
  const customerOR = [
    { code: contains }, { name: contains }, { shortName: contains }, { fullName: contains },
    { contact: contains }, { phone: contains }, { mobile: contains }, { email: contains },
    { salesman: contains }, { brandName: contains },
  ];
  return { ...(query.status ? { status: query.status } : {}), OR: isProvider ? providerOR : customerOR };
};
router.use(['/providers', '/customers'], authenticate, requireRole(RoleCode.ADMIN));
function routes(prefix: '/providers' | '/customers', resource: 'PROVIDER' | 'CUSTOMER') {
  const isProvider = prefix === '/providers';
  const createSchema = isProvider ? providerBodySchema : customerBodySchema;
  const patchSchemaForRoute = isProvider ? providerPatchSchema : customerPatchSchema;
  router.get(prefix, async (req, res, next) => { try { const query = listSchema.parse(req.query); const where = whereFor(query, isProvider); const [list, total] = isProvider ? await prisma.$transaction([prisma.provider.findMany({ where, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.provider.count({ where })]) : await prisma.$transaction([prisma.customer.findMany({ where, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.customer.count({ where })]); ok(res, { list, total, page: query.page, pageSize: query.pageSize }); } catch (error) { next(error); } });
  router.post(prefix, async (req, res, next) => { try { const body = createSchema.parse(req.body); const item = isProvider ? await prisma.provider.create({ data: body }) : await prisma.customer.create({ data: body }); await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource, resourceId: item.id, detail: { code: item.code, name: item.name }, ip: req.ip }); ok(res, item, '创建成功', 201); } catch (error) { next(error); } });
  router.patch(`${prefix}/:id`, async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const body = patchSchemaForRoute.parse(req.body); const exists = isProvider ? await prisma.provider.findUnique({ where: { id } }) : await prisma.customer.findUnique({ where: { id } }); if (!exists) throw new HttpError(404, '记录不存在'); const item = isProvider ? await prisma.provider.update({ where: { id }, data: body }) : await prisma.customer.update({ where: { id }, data: body }); await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource, resourceId: id, detail: body, ip: req.ip }); ok(res, item, '修改成功'); } catch (error) { next(error); } });
  router.post(`${prefix}/:id/toggle`, async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const { status } = z.object({ status: statusSchema }).strict().parse(req.body); const exists = isProvider ? await prisma.provider.findUnique({ where: { id } }) : await prisma.customer.findUnique({ where: { id } }); if (!exists) throw new HttpError(404, '记录不存在'); const item = isProvider ? await prisma.provider.update({ where: { id }, data: { status } }) : await prisma.customer.update({ where: { id }, data: { status } }); await writeOperationLog({ userId: req.auth!.userId, action: 'TOGGLE', resource, resourceId: id, detail: { status }, ip: req.ip }); ok(res, item, status === RecordStatus.ACTIVE ? '已启用' : '已停用'); } catch (error) { next(error); } });
}
routes('/providers', 'PROVIDER'); routes('/customers', 'CUSTOMER'); export default router;
