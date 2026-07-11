import type { NextFunction, Request, Response } from 'express';
import { AccountStatus, RoleCode } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new HttpError(401, '缺少访问令牌'));
  try {
    const payload = verifyAccessToken(token);
    const session = await prisma.userSession.findUnique({
      where: { id: payload.sid },
      select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { status: true, role: { select: { code: true } } } } },
    });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== AccountStatus.ACTIVE || session.user.role.code !== payload.role) {
      throw new HttpError(401, '访问令牌无效或已失效');
    }
    req.auth = { userId: payload.sub, sessionId: payload.sid, role: payload.role };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, '访问令牌无效或已过期'));
  }
}

export function requireRole(...roles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new HttpError(401, '未登录'));
    if (!roles.includes(req.auth.role)) return next(new HttpError(403, '无权访问该资源'));
    next();
  };
}
