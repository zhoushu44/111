import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // 备份相关配置
  // 备份文件存放目录，默认为进程工作目录下的 backups
  BACKUP_DIR: z.string().default('backups'),
  // 数据库备份加密口令：配置后 pg_dump 产物经 gpg AES-256 加密。
  // 因数据库中存有明文 AI 密钥，生产环境必须配置，否则备份以明文落盘。
  BACKUP_ENCRYPTION_PASSPHRASE: z.string().optional(),
  // 备份保留天数（本地）
  BACKUP_RETAIN_DAYS: z.coerce.number().int().positive().default(7),
  // pg_dump 可执行文件路径。默认从 PATH 查找；本机/容器中若不在 PATH，
  // 可显式指定绝对路径（Windows 下 ServBay 等集成环境常需配置）。
  PG_DUMP_PATH: z.string().default('pg_dump'),
});

export const env = schema.parse(process.env);
