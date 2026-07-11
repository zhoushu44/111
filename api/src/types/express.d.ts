import type { RoleCode } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; role: RoleCode };
    }
  }
}

export {};
