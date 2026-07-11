import bcrypt from 'bcrypt';
import { AccountStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), keyword: z.string().trim().max(100).optional(), status: z.nativeEnum(AccountStatus).optional(), role: z.nativeEnum(RoleCode).optional() }).strict();
const createSchema = z.object({ username: z.string().trim().min(1).max(50), displayName: z.string().trim().min(1).max(100), password: z.string().min(8).max(128), role: z.nativeEnum(RoleCode), status: z.nativeEnum(AccountStatus).optional() }).strict();
const updateSchema = z.object({ displayName: z.string().trim().min(1).max(100).optional(), role: z.nativeEnum(RoleCode).optional(), status: z.nativeEnum(AccountStatus).optional() }).strict().refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');
const passwordSchema = z.object({ password: z.string().min(8).max(128) }).strict();
const publicSelect = { id: true, username: true, displayName: true, status: true, createdAt: true, updatedAt: true, role: { select: { id: true, code: true, name: true } } } as const;
router.use(authenticate, requireRole(RoleCode.ADMIN));
async function roleId(code: RoleCode) { const role = await prisma.role.findUnique({ where: { code } }); if (!role) throw new HttpError(400, '角色不存在'); return role.id; }
async function revokeSessions(userId: string) { await prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }); }
router.get('/', async (req, res, next) => { try { const query = listSchema.parse(req.query); const where = { ...(query.status ? { status: query.status } : {}), ...(query.role ? { role: { code: query.role } } : {}), ...(query.keyword ? { OR: [{ username: { contains: query.keyword, mode: 'insensitive' as const } }, { displayName: { contains: query.keyword, mode: 'insensitive' as const } }] } : {}) }; const [list, total] = await prisma.$transaction([prisma.userAccount.findMany({ where, select: publicSelect, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.userAccount.count({ where })]); ok(res, { list, total, page: query.page, pageSize: query.pageSize }); } catch (error) { next(error); } });
router.post('/', async (req, res, next) => { try { const body = createSchema.parse(req.body); const item = await prisma.userAccount.create({ data: { username: body.username, displayName: body.displayName, passwordHash: await bcrypt.hash(body.password, 12), roleId: await roleId(body.role), status: body.status }, select: publicSelect }); await writeOperationLog({ userId: req.auth!.userId, action: 'CREATE', resource: 'USER_ACCOUNT', resourceId: item.id, detail: { username: item.username, role: body.role }, ip: req.ip }); ok(res, item, '创建成功', 201); } catch (error) { next(error); } });
router.patch('/:id', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const body = updateSchema.parse(req.body); const current = await prisma.userAccount.findUnique({ where: { id }, select: { role: { select: { code: true } }, status: true } }); if (!current) throw new HttpError(404, '用户不存在'); const roleChanged = body.role !== undefined && body.role !== current.role.code; const statusChanged = body.status !== undefined && body.status !== current.status; const item = await prisma.userAccount.update({ where: { id }, data: { displayName: body.displayName, status: body.status, ...(body.role ? { roleId: await roleId(body.role) } : {}) }, select: publicSelect }); if (roleChanged || statusChanged) await revokeSessions(id); await writeOperationLog({ userId: req.auth!.userId, action: 'UPDATE', resource: 'USER_ACCOUNT', resourceId: id, detail: body, ip: req.ip }); ok(res, item, roleChanged || statusChanged ? '修改成功，原会话已失效' : '修改成功'); } catch (error) { next(error); } });
router.post('/:id/reset-password', async (req, res, next) => { try { const { id } = idSchema.parse(req.params); const { password } = passwordSchema.parse(req.body); if (!await prisma.userAccount.findUnique({ where: { id } })) throw new HttpError(404, '用户不存在'); await prisma.userAccount.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 12) } }); await revokeSessions(id); await writeOperationLog({ userId: req.auth!.userId, action: 'RESET_PASSWORD', resource: 'USER_ACCOUNT', resourceId: id, ip: req.ip }); ok(res, null, '密码已重置，原会话已失效'); } catch (error) { next(error); } });
export default router;
