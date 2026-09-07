import bcrypt from 'bcrypt';
import { AccountStatus, Prisma, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const idSchema = z.object({ id: z.string().uuid('用户 ID 无效') });
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), keyword: z.string().trim().max(100).optional(), status: z.nativeEnum(AccountStatus).optional(), role: z.nativeEnum(RoleCode).optional() }).strict();
const createSchema = z.object({ username: z.string().trim().min(1, '请输入用户名').max(50, '用户名最长 50 位'), displayName: z.string().trim().min(1, '请输入显示名').max(100, '显示名最长 100 位'), password: z.string().min(8, '密码至少 8 位').max(128, '密码最长 128 位'), role: z.nativeEnum(RoleCode, { message: '角色无效' }), status: z.nativeEnum(AccountStatus, { message: '状态无效' }).optional() }).strict();
const updateSchema = z.object({ displayName: z.string().trim().min(1, '请输入显示名').max(100, '显示名最长 100 位').optional(), role: z.nativeEnum(RoleCode, { message: '角色无效' }).optional(), status: z.nativeEnum(AccountStatus, { message: '状态无效' }).optional() }).strict().refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');
const passwordSchema = z.object({ password: z.string().min(8, '密码至少 8 位').max(128, '密码最长 128 位') }).strict();
const publicSelect = { id: true, username: true, displayName: true, status: true, createdAt: true, updatedAt: true, role: { select: { id: true, code: true, name: true } } } as const;
router.use(authenticate, requireRole(RoleCode.ADMIN));
async function roleId(code: RoleCode) { const role = await prisma.role.findUnique({ where: { code } }); if (!role) throw new HttpError(400, '角色不存在，请先执行数据库种子初始化'); return role.id; }
async function revokeSessions(userId: string) { await prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }); }
function handleUniqueError(error: unknown): HttpError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta?.target as string[] | undefined) ?? [];
    if (target.includes('username')) return new HttpError(409, '用户名已存在');
    return new HttpError(409, '唯一字段已存在');
  }
  return null;
}
router.get('/', async (req, res, next) => { try { const query = listSchema.parse(req.query); const where = { ...(query.status ? { status: query.status } : {}), ...(query.role ? { role: { code: query.role } } : {}), ...(query.keyword ? { OR: [{ username: { contains: query.keyword, mode: 'insensitive' as const } }, { displayName: { contains: query.keyword, mode: 'insensitive' as const } }] } : {}) }; const [list, total] = await prisma.$transaction([prisma.userAccount.findMany({ where, select: publicSelect, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.userAccount.count({ where })]); ok(res, { list, total, page: query.page, pageSize: query.pageSize }); } catch (error) { next(error); } });
router.post('/', async (req, res, next) => { try { const body = createSchema.parse(req.body); const item = await prisma.userAccount.create({ data: { username: body.username, displayName: body.displayName, passwordHash: await bcrypt.hash(body.password, 12), roleId: await roleId(body.role), status: body.status }, select: publicSelect }); await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: 'USER_ACCOUNT', resourceId: item.id, detail: { username: item.username, role: body.role }, ip: req.ip }); ok(res, item, '创建成功', 201); } catch (error) { next(handleUniqueError(error) ?? error); } });
router.patch('/:id', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const body = updateSchema.parse(req.body); const current = await prisma.userAccount.findUnique({ where: { id }, select: { role: { select: { code: true } }, status: true } }); if (!current) throw new HttpError(404, '用户不存在'); const roleChanged = body.role !== undefined && body.role !== current.role.code; const statusChanged = body.status !== undefined && body.status !== current.status; const item = await prisma.userAccount.update({ where: { id }, data: { displayName: body.displayName, status: body.status, ...(body.role ? { roleId: await roleId(body.role) } : {}) }, select: publicSelect }); if (roleChanged || statusChanged) await revokeSessions(id); await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'USER_ACCOUNT', resourceId: id, detail: body, ip: req.ip }); ok(res, item, roleChanged || statusChanged ? '修改成功，原会话已失效' : '修改成功'); } catch (error) { next(error); } });
router.post('/:id/reset-password', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const { password } = passwordSchema.parse(req.body); if (!await prisma.userAccount.findUnique({ where: { id } })) throw new HttpError(404, '用户不存在'); await prisma.userAccount.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 12) } }); await revokeSessions(id); await writeOperationLog({ userId: req.auth!.userId, action: 'RESET_PASSWORD', resource: 'USER_ACCOUNT', resourceId: id, ip: req.ip }); ok(res, null, '密码已重置，原会话已失效'); } catch (error) { next(error); } });
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    if (req.auth!.userId === id) throw new HttpError(400, '不能删除当前登录的账号');
    const target = await prisma.userAccount.findUnique({ where: { id }, select: { username: true, displayName: true, role: { select: { code: true } }, _count: { select: { sampleChooses: true } } } });
    if (!target) throw new HttpError(404, '用户不存在');
    if (target.role.code === RoleCode.ADMIN) {
      const activeAdmins = await prisma.userAccount.count({ where: { role: { code: RoleCode.ADMIN }, status: AccountStatus.ACTIVE } });
      if (activeAdmins <= 1) throw new HttpError(400, '系统必须保留至少一名启用的管理员，不能删除该账号');
    }
    if (target._count.sampleChooses > 0) throw new HttpError(400, `账号「${target.displayName}」已创建过选样单，存在业务记录，无法删除；如需停用请使用「停用」`);
    await prisma.userSession.deleteMany({ where: { userId: id } });
    await prisma.userAccount.delete({ where: { id } });
    await writeOperationLog({ userId: req.auth!.userId, action: 'DELETE', resource: 'USER_ACCOUNT', resourceId: id, detail: { username: target.username, role: target.role.code }, ip: req.ip });
    ok(res, null, '账号已删除');
  } catch (error) { next(error); }
});
export default router;
