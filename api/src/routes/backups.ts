import { existsSync } from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { BackupStatus, BackupTrigger, BackupType, RoleCode } from '@prisma/client';
import { HttpError } from '../lib/http-error.js';
import { ok } from '../lib/api-response.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeOperationLog } from '../services/operation-log.service.js';
import { maskKey } from '../services/ai-config.service.js';
import { getStorageConfig, saveStorageConfig, testStorage } from '../services/storage-config.service.js';
import {
  cleanupExpiredBackups,
  collectExactTableStats,
  getBackupDiskUsage,
  runDatabaseBackup,
  runFullBackup,
  runManifestBackup,
  uploadBackupFile,
} from '../services/backup.service.js';
import { getBackupSchedule, saveBackupSchedule } from '../services/backup-schedule.service.js';

const router = Router();

// 备份管理属高危功能，仅管理员可用
router.use(authenticate, requireRole(RoleCode.ADMIN));

const listSchema = z.object({
  type: z.nativeEnum(BackupType).optional(),
  status: z.nativeEnum(BackupStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const idSchema = z.object({ id: z.string().uuid() });

// 对象存储配置：密钥允许传脱敏占位（含 *），表示未修改
const storageConfigSchema = z
  .object({
    enabled: z.coerce.boolean(),
    region: z.string().trim().max(100),
    bucket: z.string().trim().max(200),
    secretId: z.string().trim().max(200),
    secretKey: z.string().trim().max(200),
    domain: z.string().trim().max(300).optional(),
  })
  .strict();

// 序列化：BigInt 无法直接 JSON 化，统一转 number
function serialize(record: {
  id: string;
  type: BackupType;
  trigger: BackupTrigger;
  status: BackupStatus;
  fileName: string;
  fileSize: bigint;
  encrypted: boolean;
  tableStats: unknown;
  errorMessage: string | null;
  storageKey?: string | null;
  uploaded?: boolean;
  uploadError?: string | null;
  protected: boolean;
  startedAt: Date;
  finishedAt: Date | null;
}) {
  return {
    id: record.id,
    type: record.type,
    trigger: record.trigger,
    status: record.status,
    fileName: record.fileName,
    fileSize: Number(record.fileSize),
    encrypted: record.encrypted,
    tableStats: record.tableStats,
    errorMessage: record.errorMessage,
    storageKey: record.storageKey ?? null,
    uploaded: record.uploaded ?? false,
    uploadError: record.uploadError ?? null,
    protected: record.protected,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const where = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.startDate || query.endDate
        ? {
            startedAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [rows, total, disk] = await Promise.all([
      prisma.backupRecord.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.backupRecord.count({ where }),
      getBackupDiskUsage(),
    ]);

    ok(res, { list: rows.map(serialize), total, page: query.page, pageSize: query.pageSize, disk });
  } catch (error) {
    next(error);
  }
});

// 手动触发备份。避免并发重复触发：任何类型存在 RUNNING 记录时直接拒绝。
router.post('/run', async (req, res, next) => {
  try {
    const body = z.object({ type: z.nativeEnum(BackupType).default(BackupType.FULL) }).parse(req.body ?? {});

    const running = await prisma.backupRecord.findFirst({
      where: { status: BackupStatus.RUNNING },
      select: { id: true, startedAt: true },
    });
    if (running) throw new HttpError(409, '已有备份任务正在执行，请稍后再试');

    let record: Awaited<ReturnType<typeof runFullBackup>>;
    if (body.type === BackupType.FULL) {
      record = await runFullBackup(BackupTrigger.MANUAL);
    } else if (body.type === BackupType.DATABASE) {
      record = await runDatabaseBackup(BackupTrigger.MANUAL);
    } else {
      record = await runManifestBackup(BackupTrigger.MANUAL);
    }

    await writeOperationLog({
      userId: req.auth!.userId,
      action: 'BACKUP',
      resource: 'BACKUP_RECORD',
      resourceId: record.id,
      detail: { type: body.type, status: record.status, fileName: record.fileName },
      ip: req.ip,
    });

    if (record.status === BackupStatus.FAILED) throw new HttpError(500, record.errorMessage || '备份执行失败');
    ok(res, serialize(record), '备份完成', 201);
  } catch (error) {
    next(error);
  }
});

// 下载备份文件。加密备份须提示含敏感数据，前端负责展示该提示。
router.get('/:id/download', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const record = await prisma.backupRecord.findUnique({ where: { id } });
    if (!record) throw new HttpError(404, '备份记录不存在');
    if (record.status !== BackupStatus.SUCCESS) throw new HttpError(400, '该备份未成功完成，无法下载');
    if (!existsSync(record.filePath)) throw new HttpError(404, '备份文件已丢失');

    await writeOperationLog({
      userId: req.auth!.userId,
      action: 'DOWNLOAD',
      resource: 'BACKUP_RECORD',
      resourceId: id,
      detail: { fileName: record.fileName },
      ip: req.ip,
    });

    res.download(record.filePath, record.fileName);
  } catch (error) {
    next(error);
  }
});

// 删除备份记录与文件。双重保护：手动备份不可删，最近一次成功备份不可删。
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const record = await prisma.backupRecord.findUnique({ where: { id } });
    if (!record) throw new HttpError(404, '备份记录不存在');
    if (record.protected) throw new HttpError(400, '手动触发的备份受保护，不可删除');
    if (record.status === BackupStatus.RUNNING) throw new HttpError(400, '备份正在执行中，无法删除');

    const latestSuccess = await prisma.backupRecord.findFirst({
      where: { type: record.type, status: BackupStatus.SUCCESS },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (latestSuccess?.id === record.id) throw new HttpError(400, '最近一次成功备份不可删除');

    const { unlink } = await import('node:fs/promises');
    await unlink(record.filePath).catch(() => undefined);
    await prisma.backupRecord.delete({ where: { id } });

    await writeOperationLog({
      userId: req.auth!.userId,
      action: 'DELETE',
      resource: 'BACKUP_RECORD',
      resourceId: id,
      detail: { fileName: record.fileName },
      ip: req.ip,
    });

    ok(res, null, '已删除');
  } catch (error) {
    next(error);
  }
});

// 恢复前的数据比对：返回当前库与目标备份的关键表行数差异，
// 供操作者在确认恢复前了解影响范围。
router.get('/:id/verify', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const record = await prisma.backupRecord.findUnique({ where: { id } });
    if (!record) throw new HttpError(404, '备份记录不存在');
    if (record.type === BackupType.MANIFEST) throw new HttpError(400, '图片清单不包含数据库数据，无法进行数据比对');
    if (record.status !== BackupStatus.SUCCESS) throw new HttpError(400, '该备份未成功完成');

    const backupStats = (record.tableStats ?? {}) as Record<string, number>;
    const currentStats = await collectExactTableStats();

    const tables = Array.from(new Set([...Object.keys(backupStats), ...Object.keys(currentStats)])).sort();
    const comparison = tables.map((table) => {
      const backupCount = backupStats[table] ?? 0;
      const currentCount = currentStats[table] ?? 0;
      return { table, backupCount, currentCount, diff: backupCount - currentCount };
    });

    ok(res, {
      backupAt: record.startedAt,
      currentAt: new Date(),
      comparison,
      blocked: record.encrypted && !hasPassphrase(),
    });
  } catch (error) {
    next(error);
  }
});

// 恢复属于高危操作，此处不提供一键执行接口：
// 数据库恢复会覆盖生产数据，必须由运维按文档在服务器上执行，UI 只做引导与校验。
// 这里仅暴露「恢复指引」，确保前端不会提供任何直接触发恢复的通道。
router.get('/:id/restore-guide', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const record = await prisma.backupRecord.findUnique({ where: { id } });
    if (!record) throw new HttpError(404, '备份记录不存在');
    if (record.type === BackupType.MANIFEST) throw new HttpError(400, '图片清单不含数据库，无需恢复');

    const encrypted = record.encrypted;
    // 加密文件为「MAGIC + salt + iv + 密文 + authTag」格式（AES-256-GCM），
    // 通用 gpg/gunzip 无法直接解开，必须用配套脚本解密，故指引中给出脚本方式。
    const useScript = record.encrypted || record.type === BackupType.FULL;
    // 加密文件为「MAGIC + salt + iv + 密文 + authTag」格式（AES-256-GCM），
    // 完整备份为 tar.gz 包（脚本自动提取其中 database.sql.gz），
    // 通用 gunzip 无法直接处理这两种格式，必须用配套脚本，故指引中给出脚本方式。
    const steps = useScript
      ? [
          '# 1. 恢复前务必确认已在测试环境验证，且已对当前库做一次备份',
          `# 2. 目标备份文件${record.encrypted ? '（已加密）' : (record.type === BackupType.FULL ? '（完整包，脚本自动提取数据库部分）' : '')}：${record.filePath}`,
          `npx tsx scripts/restore-backup.ts "${record.fileName}" --target-db <目标库名>`,
          '',
          '# 3. 确认迁移状态（_prisma_migrations 已随备份恢复）',
          'npx prisma migrate deploy',
          '',
          '# 4. 校验关键表行数是否与备份时一致，再启动应用',
        ].join('\n')
      : [
          '# 1. 恢复前务必确认已在测试环境验证，且已对当前库做一次备份',
          `# 2. 目标备份文件：${record.filePath}`,
          `gunzip -c "${record.fileName}" \\`,
          '  | psql -h <host> -U <user> -d <database>',
          '',
          '# 3. 确认迁移状态（_prisma_migrations 已随备份恢复）',
          'npx prisma migrate deploy',
          '',
          '# 4. 校验关键表行数是否与备份时一致，再启动应用',
        ].join('\n');

    ok(res, {
      backupAt: record.startedAt,
      fileName: record.fileName,
      encrypted,
      tableStats: record.tableStats,
      steps,
    });
  } catch (error) {
    next(error);
  }
});

// 手动清理过期备份
router.post('/cleanup', async (req, res, next) => {
  try {
    const removed = await cleanupExpiredBackups();
    await writeOperationLog({
      userId: req.auth!.userId,
      action: 'CLEANUP',
      resource: 'BACKUP_RECORD',
      detail: { removedCount: removed.length, removed },
      ip: req.ip,
    });
    ok(res, { removedCount: removed.length, removed }, `已清理 ${removed.length} 个过期备份`);
  } catch (error) {
    next(error);
  }
});

// ===== 对象存储配置 =====

// 读取对象存储配置：密钥脱敏回显
router.get('/storage/config', async (_req, res, next) => {
  try {
    const cfg = await getStorageConfig();
    ok(res, {
      enabled: cfg.enabled,
      region: cfg.region,
      bucket: cfg.bucket,
      maskedSecretId: maskKey(cfg.secretId),
      maskedSecretKey: maskKey(cfg.secretKey),
      domain: cfg.domain,
      configured: cfg.configured,
    });
  } catch (error) {
    next(error);
  }
});

// 测试对象存储连通性（用提交的值，不落库）
router.post('/storage/test', async (req, res, next) => {
  try {
    const body = storageConfigSchema.partial().parse(req.body ?? {});
    const result = await testStorage(body);
    ok(res, result);
  } catch (error) {
    next(error);
  }
});

// 保存对象存储配置
router.put('/storage/config', async (req, res, next) => {
  try {
    const body = storageConfigSchema.parse(req.body);
    await saveStorageConfig(body);
    await writeOperationLog({
      userId: req.auth!.userId,
      action: 'UPDATE',
      resource: 'STORAGE_CONFIG',
      detail: { enabled: body.enabled, region: body.region, bucket: body.bucket },
      ip: req.ip,
    });
    ok(res, null, '保存成功，配置已生效');
  } catch (error) {
    next(error);
  }
});

// 重新上传本地已存在但未成功上传到对象存储的备份
router.post('/:id/upload', async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    const record = await prisma.backupRecord.findUnique({ where: { id } });
    if (!record) throw new HttpError(404, '备份记录不存在');
    if (record.status !== BackupStatus.SUCCESS) throw new HttpError(400, '备份未成功完成，无法上传');
    if (record.uploaded) throw new HttpError(400, '该备份已上传到对象存储');
    if (!existsSync(record.filePath)) throw new HttpError(404, '本地备份文件已丢失，无法上传');

    const result = await uploadBackupFile(record.id, record.filePath, record.fileName);
    if (!result.uploaded) {
      throw new HttpError(502, result.uploadError ? `上传失败：${result.uploadError}` : '对象存储未启用或未配置完整');
    }

    await writeOperationLog({
      userId: req.auth!.userId,
      action: 'UPLOAD',
      resource: 'BACKUP_RECORD',
      resourceId: id,
      detail: { storageKey: result.storageKey },
      ip: req.ip,
    });
    ok(res, result, '已上传到对象存储');
  } catch (error) {
    next(error);
  }
});

function hasPassphrase(): boolean {
  return Boolean(process.env.BACKUP_ENCRYPTION_PASSPHRASE);
}

// ===== 自动备份定时配置 =====

const scheduleSchema = z
  .object({
    enabled: z.coerce.boolean(),
    time: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, '备份时间格式应为 HH:mm'),
  })
  .strict();

router.get('/schedule', async (_req, res, next) => {
  try {
    ok(res, await getBackupSchedule());
  } catch (error) {
    next(error);
  }
});

router.put('/schedule', async (req, res, next) => {
  try {
    const saved = await saveBackupSchedule(scheduleSchema.parse(req.body));
    await writeOperationLog({
      userId: req.auth!.userId,
      action: 'UPDATE',
      resource: 'BACKUP_SCHEDULE',
      detail: { ...saved },
      ip: req.ip,
    });
    ok(res, saved, saved.enabled ? `自动备份已开启：每天 ${saved.time} 执行` : '自动备份已关闭');
  } catch (error) {
    next(error);
  }
});

export default router;
