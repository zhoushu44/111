import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export function writeOperationLog(input: {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  detail?: Prisma.InputJsonValue;
  ip?: string;
}) {
  return prisma.operationLog.create({ data: input });
}
