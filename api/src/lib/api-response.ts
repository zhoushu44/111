import type { Response } from 'express';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export function ok<T>(res: Response, data: T, message = 'success', status = 200) {
  return res.status(status).json({ code: 0, message, data } satisfies ApiResponse<T>);
}
