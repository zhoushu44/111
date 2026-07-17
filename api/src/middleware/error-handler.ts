import type { ErrorRequestHandler, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http-error.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next: NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ code: error.code, message: error.message, data: null });
  if (error instanceof MulterError) return res.status(400).json({ code: 400, message: error.code === 'LIMIT_FILE_SIZE' ? '图片文件不能超过 5MB' : '上传文件无效', data: null });
  if (error instanceof ZodError) return res.status(400).json({ code: 400, message: '请求参数无效', data: error.flatten() });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ code: 409, message: '唯一字段已存在', data: null });
  console.error(error);
  return res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
};
