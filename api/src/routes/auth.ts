import { Prisma, AccountStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { authenticate } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';

const router = Router();
const credentialsSchema = z.object({ username: z.string().trim().min(1).max(50), password: z.string().min(1).max(128), deviceName: z.string().trim().max(255).optional() });
const bootstrapAdminSchema = z.object({
  username: z.string().trim().min(3).max(50),
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((body) => body.password === body.confirmPassword, { message: '两次输入的密码不一致', path: ['confirmPassword'] });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
type AuthenticatedUser = { id: string; username: string; displayName: string; role: { code: RoleCode; name: string } };
type DatabaseClient = Prisma.TransactionClient | typeof prisma;

const publicUser = (user: AuthenticatedUser) => ({
  id: user.id, username: user.username, displayName: user.displayName, role: user.role,
});

async function createSessionTokens(client: DatabaseClient, user: AuthenticatedUser, deviceName?: string) {
  const session = await client.userSession.create({
    data: { userId: user.id, refreshTokenHash: 'pending', deviceName, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });
  const payload = { sub: user.id, sid: session.id, role: user.role.code };
  const refreshToken = signRefreshToken(payload);
  await client.userSession.update({ where: { id: session.id }, data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) } });
  return { user: publicUser(user), accessToken: signAccessToken(payload), refreshToken };
}

router.get('/bootstrap-status', async (_req, res, next) => {
  try {
    const initialized = await prisma.userAccount.count({ where: { role: { code: RoleCode.ADMIN } } }) > 0;
    ok(res, { initialized });
  } catch (error) { next(error); }
});

router.post('/bootstrap-admin', async (req, res, next) => {
  try {
    const body = bootstrapAdminSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bootstrap-admin'))`;
      const existingAdmin = await tx.userAccount.findFirst({ where: { role: { code: RoleCode.ADMIN } }, select: { id: true } });
      if (existingAdmin) throw new HttpError(409, '管理员已初始化，请直接登录');
      const role = await tx.role.upsert({ where: { code: RoleCode.ADMIN }, update: { name: '管理员' }, create: { code: RoleCode.ADMIN, name: '管理员' } });
      const user = await tx.userAccount.create({
        data: { username: body.username, displayName: body.displayName, passwordHash: await bcrypt.hash(body.password, 12), status: AccountStatus.ACTIVE, roleId: role.id },
        include: { role: true },
      });
      const tokens = await createSessionTokens(tx, user, req.header('user-agent')?.slice(0, 255));
      await tx.operationLog.create({ data: { action: 'BOOTSTRAP_ADMIN', resource: 'AUTH', ip: req.ip } });
      return tokens;
    });
    ok(res, result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return next(new HttpError(409, '管理员已初始化，请直接登录'));
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const body = credentialsSchema.parse(req.body);
    const user = await prisma.userAccount.findUnique({ where: { username: body.username }, include: { role: true } });
    if (!user || user.status !== AccountStatus.ACTIVE || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, '用户名或密码错误');
    }
    const tokens = await createSessionTokens(prisma, user, body.deviceName ?? req.header('user-agent')?.slice(0, 255));
    await writeOperationLog({ userId: user.id, action: 'LOGIN', resource: 'AUTH', ip: req.ip });
    ok(res, tokens);
  } catch (error) { next(error); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const payload = verifyRefreshToken(refreshToken);
    const session = await prisma.userSession.findUnique({ where: { id: payload.sid }, include: { user: { include: { role: true } } } });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== AccountStatus.ACTIVE || !(await bcrypt.compare(refreshToken, session.refreshTokenHash))) {
      throw new HttpError(401, '刷新令牌无效或已过期');
    }
    const nextPayload = { sub: session.user.id, sid: session.id, role: session.user.role.code };
    const nextRefreshToken = signRefreshToken(nextPayload);
    await prisma.userSession.update({ where: { id: session.id }, data: { refreshTokenHash: await bcrypt.hash(nextRefreshToken, 12) } });
    ok(res, { user: publicUser(session.user), accessToken: signAccessToken(nextPayload), refreshToken: nextRefreshToken });
  } catch (error) { next(error); }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await prisma.userSession.updateMany({ where: { id: req.auth!.sessionId, userId: req.auth!.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeOperationLog({ userId: req.auth!.userId, action: 'LOGOUT', resource: 'AUTH', ip: req.ip });
    ok(res, null, '已退出');
  } catch (error) { next(error); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.userAccount.findUnique({ where: { id: req.auth!.userId }, include: { role: true } });
    if (!user || user.status !== AccountStatus.ACTIVE) throw new HttpError(401, '账号不可用');
    ok(res, publicUser(user));
  } catch (error) { next(error); }
});

export default router;
