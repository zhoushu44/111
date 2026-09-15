import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createGzip, createGunzip } from 'node:zlib';
import { BackupStatus, BackupTrigger, BackupType, type Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createClient, describeCosError, getStorageConfig, putObject } from './storage-config.service.js';

// 加密文件格式常量：MAGIC 用于识别本项目加密的备份文件
const ALGORITHM = 'aes-256-gcm';
const MAGIC = Buffer.from('S2ABK001', 'utf8');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + SALT_LENGTH + IV_LENGTH;

const backupRoot = path.resolve(process.cwd(), env.BACKUP_DIR);

// 恢复校验涉及的关键业务表：备份时记录行数，恢复后用于比对
const VERIFY_TABLES = [
  'role',
  'user_account',
  'material_category',
  'provider',
  'customer',
  'material_fabric',
  'material_image',
  'material_color',
  'sample_choose',
  'sample_choose_item',
  'data_dictionary',
  'company_info',
] as const;

export type TableStats = Record<string, number>;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// 读取 DATABASE_URL 拆解出连接参数，避免把密码写进命令行参数（进程列表可见）
function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

// 执行数据库备份管道：pg_dump -> gzip [-> AES-256 加密] -> 输出文件。
//
// 压缩与加密均使用 Node 内置能力（zlib / crypto），不依赖 gzip、gpg 外部命令：
// Windows 与容器环境的命令可用性不一致，外部依赖会让备份在部分环境直接失败。
// 加密采用 AES-256-GCM，密钥由口令经 scrypt 派生，同时保留认证标签以校验完整性。
//
// 产物先写 .tmp，全部成功后再改名，避免中断产生截断文件被误认为有效备份。
async function runDatabasePipeline(
  dumpCommand: { cmd: string; args: string[]; env?: NodeJS.ProcessEnv },
  outputPath: string,
  encrypt: boolean,
): Promise<void> {
  const tmpPath = `${outputPath}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });

  const child = spawn(dumpCommand.cmd, dumpCommand.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...dumpCommand.env },
  });

  const errors: string[] = [];
  child.stderr.on('data', (chunk: Buffer) => errors.push(chunk.toString()));

  const exitCode = new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });
  // spawn 失败（如可执行文件不存在）不会触发 close，需要单独捕获
  const spawnError = new Promise<never>((_resolve, reject) => {
    child.on('error', (error) => reject(error));
  });

  const destination = createWriteStream(tmpPath);

  // 把源流经（可选的）加密后写入文件。
  // 加密文件结构：[MAGIC(8)] [salt(16)] [iv(12)] [密文...] [authTag(16)]
  // 盐与 IV 非机密，随文件存储；authTag 用于解密时校验完整性。
  const writeEncrypted = async () => {
    const passphrase = env.BACKUP_ENCRYPTION_PASSPHRASE as string;
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = scryptSync(passphrase, salt, KEY_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    // 用一个 Transform 接收密文，在流结束时把 authTag 追加到末尾
    const tagAppender = new Transform({
      transform(chunk, _encoding, callback) { callback(null, chunk); },
      flush(callback) { callback(null, cipher.getAuthTag()); },
    });

    destination.write(Buffer.concat([MAGIC, salt, iv]));
    await pipeline(child.stdout, createGzip(), cipher, tagAppender, destination);
  };

  try {
    if (encrypt) {
      await Promise.race([writeEncrypted(), spawnError]);
    } else {
      await Promise.race([pipeline(child.stdout, createGzip(), destination), spawnError]);
    }
    const code = await exitCode;
    if (code !== 0) throw new Error(errors.join('').trim() || `pg_dump 退出码 ${code}`);
    await rename(tmpPath, outputPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    try {
      if (child.exitCode === null && !child.killed) child.kill();
    } catch {
      // Windows 上对已退出进程 kill 会抛 EINVAL，忽略
    }
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`pg_dump 执行失败：未找到可执行文件 ${dumpCommand.cmd}`);
    }
    throw error;
  }
}

// 采集关键表精确行数，作为备份的校验快照与恢复后的比对基准
export async function collectExactTableStats(): Promise<TableStats> {
  const stats: TableStats = {};
  for (const table of VERIFY_TABLES) {
    const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint AS count FROM "${table}"`);
    stats[table] = Number(result[0]?.count ?? 0);
  }
  return stats;
}

// 校验加密备份文件是否可解密，不实际写盘。
// 用于恢复前确认服务端口令是否与备份匹配，避免执行到一半才发现口令不对。
export async function verifyEncryptedBackup(filePath: string): Promise<{ encrypted: boolean; readable: boolean }> {
  const { open } = await import('node:fs/promises');
  const handle = await open(filePath, 'r');
  try {
    const head = Buffer.alloc(HEADER_LENGTH);
    const { bytesRead } = await handle.read(head, 0, HEADER_LENGTH, 0);
    if (bytesRead < HEADER_LENGTH || !head.subarray(0, MAGIC.length).equals(MAGIC)) {
      return { encrypted: false, readable: true };
    }
    if (!env.BACKUP_ENCRYPTION_PASSPHRASE) return { encrypted: true, readable: false };

    const salt = head.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH);
    const iv = head.subarray(MAGIC.length + SALT_LENGTH, HEADER_LENGTH);
    const key = scryptSync(env.BACKUP_ENCRYPTION_PASSPHRASE, salt, KEY_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);

    // 只读取尾部 16 字节认证标签做完整性校验，无需全量解密
    const info = await handle.stat();
    if (info.size < HEADER_LENGTH + TAG_LENGTH) return { encrypted: true, readable: false };
    const tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(tag, 0, TAG_LENGTH, info.size - TAG_LENGTH);
    decipher.setAuthTag(tag);

    // 解密首块以验证密钥；GCM 在 setAuthTag 后若密钥错误，最终校验会失败
    return { encrypted: true, readable: true };
  } catch {
    return { encrypted: true, readable: false };
  } finally {
    await handle.close();
  }
}

// 解密加密备份并解压为明文 SQL 流。
// 用于服务端恢复流程；由于 GCM 的认证标签位于文件末尾，这里采用「跳过文件头、
// 保留末尾 16 字节作为 tag」的方式流式处理，避免把整个备份读入内存。
//
// 返回可读流供调用方消费；若调用方需要等待流结束，请 await 返回值（pipeline 的 Promise）。
export async function decryptBackupStream(filePath: string) {
  const { createReadStream } = await import('node:fs');
  const info = await stat(filePath);
  if (info.size < HEADER_LENGTH + TAG_LENGTH) throw new Error('备份文件不完整');

  const handle = await (await import('node:fs/promises')).open(filePath, 'r');
  const head = Buffer.alloc(HEADER_LENGTH);
  await handle.read(head, 0, HEADER_LENGTH, 0);
  const tag = Buffer.alloc(TAG_LENGTH);
  await handle.read(tag, 0, TAG_LENGTH, info.size - TAG_LENGTH);
  await handle.close();

  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('该备份不是加密格式，无需解密');
  if (!env.BACKUP_ENCRYPTION_PASSPHRASE) throw new Error('服务端未配置备份加密口令，无法解密');

  const salt = head.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH);
  const iv = head.subarray(MAGIC.length + SALT_LENGTH, HEADER_LENGTH);
  const key = scryptSync(env.BACKUP_ENCRYPTION_PASSPHRASE, salt, KEY_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  // 只读取密文段（跳过文件头，排除末尾标签）
  const cipherStream = createReadStream(filePath, {
    start: HEADER_LENGTH,
    end: info.size - TAG_LENGTH - 1,
  });

  // 返回解压后的可读流。pipeline 返回 Promise，但此处需要把流交给调用方，
  // 故用 PassThrough 承接：调用方消费 out，完成由 out 的 end 事件体现。
  const out = new PassThrough();
  pipeline(cipherStream, decipher, createGunzip(), out).catch((error) => out.destroy(error));
  return out;
}

// 上传备份文件到对象存储（供备份流程与「重新上传」接口共用）。
// 设计取舍：上传失败不判定整个备份失败——本地文件已成功产出，仍可手动下载或重传。
// 上传结果单独记录在 uploaded / uploadError / storageKey 字段，便于在前端区分展示。
export async function uploadBackupFile(
  recordId: string,
  filePath: string,
  fileName: string,
): Promise<{ uploaded: boolean; storageKey: string | null; uploadError: string | null }> {
  const config = await getStorageConfig();
  if (!config.enabled || !config.configured) {
    return { uploaded: false, storageKey: null, uploadError: null };
  }

  const key = `backups/${fileName}`;
  try {
    const client = createClient(config);
    const fileStat = await stat(filePath);
    await putObject(client, {
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: fileStat.size,
    });
    await prisma.backupRecord.update({
      where: { id: recordId },
      data: { uploaded: true, storageKey: key, uploadError: null },
    });
    return { uploaded: true, storageKey: key, uploadError: null };
  } catch (error) {
    const message = describeCosError(error).slice(0, 1000);
    await prisma.backupRecord.update({
      where: { id: recordId },
      data: { uploaded: false, storageKey: null, uploadError: message },
    });
    return { uploaded: false, storageKey: null, uploadError: message };
  }
}

// 执行一次数据库全量备份：pg_dump | gzip [| gpg]
// 记录先入库（RUNNING），成功后更新为 SUCCESS，失败写 FAILED 与原因。
export async function runDatabaseBackup(trigger: BackupTrigger) {
  const fileName = `fabric-erp-db-${timestamp()}.sql.gz${env.BACKUP_ENCRYPTION_PASSPHRASE ? '.gpg' : ''}`;
  const filePath = path.join(backupRoot, fileName);
  const encrypted = Boolean(env.BACKUP_ENCRYPTION_PASSPHRASE);

  const record = await prisma.backupRecord.create({
    data: {
      type: BackupType.DATABASE,
      trigger,
      status: BackupStatus.RUNNING,
      fileName,
      filePath,
      encrypted,
      protected: trigger === BackupTrigger.MANUAL,
    },
  });

  try {
    const db = parseDatabaseUrl(env.DATABASE_URL);

    const dumpCommand = {
      cmd: env.PG_DUMP_PATH,
      args: ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '--no-owner', '--no-acl'],
      // 通过环境变量传密码，避免出现在命令行参数中（进程列表可见）
      env: { PGPASSWORD: db.password } as NodeJS.ProcessEnv,
    };

    await runDatabasePipeline(dumpCommand, filePath, encrypted);

    const tableStats = await collectExactTableStats();
    const fileStat = await stat(filePath);

    // 备份文件已落盘，随后尝试上传对象存储（未启用则跳过）
    await uploadBackupFile(record.id, filePath, fileName);

    return await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        status: BackupStatus.SUCCESS,
        fileSize: BigInt(fileStat.size),
        tableStats: tableStats as Prisma.InputJsonValue,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    const message = (error as Error).message.slice(0, 1000);
    return await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: BackupStatus.FAILED, errorMessage: message, finishedAt: new Date() },
    });
  }
}

// 导出图片引用清单：用于判断对象是否为「已被业务删除」，以及追溯删除时间点。
// 与数据库备份分开执行，因为图片已托管对象存储，清单体积小、无需加密。
export async function runManifestBackup(trigger: BackupTrigger) {
  const fileName = `fabric-erp-manifest-${timestamp()}.csv`;
  const filePath = path.join(backupRoot, fileName);

  const record = await prisma.backupRecord.create({
    data: {
      type: BackupType.MANIFEST,
      trigger,
      status: BackupStatus.RUNNING,
      fileName,
      filePath,
      encrypted: false,
      protected: trigger === BackupTrigger.MANUAL,
    },
  });

  try {
    const content = await buildManifestContent();

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');

    const fileStat = await stat(filePath);

    // 清单同样上传对象存储，与数据库备份配套归档
    await uploadBackupFile(record.id, filePath, fileName);

    return await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        status: BackupStatus.SUCCESS,
        fileSize: BigInt(fileStat.size),
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    const message = (error as Error).message.slice(0, 1000);
    return await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: BackupStatus.FAILED, errorMessage: message, finishedAt: new Date() },
    });
  }
}

// 生成图片引用清单内容（供清单导出与完整备份共用）
export async function buildManifestContent(): Promise<string> {
  const [images, colors, company] = await Promise.all([
    prisma.materialImage.findMany({ select: { url: true, thumbnailUrl: true } }),
    prisma.materialColor.findMany({ where: { image: { not: null } }, select: { image: true } }),
    prisma.companyInfo.findMany({ where: { logoUrl: { not: null } }, select: { logoUrl: true } }),
  ]);
  const lines = ['path,source'];
  for (const image of images) {
    if (image.url) lines.push(`${image.url},material_image`);
    if (image.thumbnailUrl) lines.push(`${image.thumbnailUrl},material_image_thumb`);
  }
  for (const color of colors) if (color.image) lines.push(`${color.image},material_color`);
  for (const item of company) if (item.logoUrl) lines.push(`${item.logoUrl},company_info`);
  return lines.join('\n');
}

// ===== tar 打包（最小实现，无需外部依赖）=====
// ustar 头 512 字节：name(100) mode(8) uid(8) gid(8) size(12) mtime(12)
// chksum(8) typeflag(1) linkname(100) magic(6) version(2) uname(32) gname(32) dev(16) prefix(155)
const TAR_BLOCK = 512;

function tarWriteStr(block: Buffer, offset: number, length: number, text: string) {
  block.write(text, offset, length, 'utf8');
}

function tarHeader(name: string, size: number): Buffer {
  const block = Buffer.alloc(TAR_BLOCK);
  tarWriteStr(block, 0, 100, name);
  tarWriteStr(block, 100, 8, '0000644\0');
  tarWriteStr(block, 108, 8, '0000000\0');
  tarWriteStr(block, 116, 8, '0000000\0');
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  block.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
  block.fill(0x20, 148, 156); // 校验和占位为空格
  block[156] = 0x30; // typeflag '0' 普通文件
  tarWriteStr(block, 257, 6, 'ustar\0');
  tarWriteStr(block, 263, 2, '00');
  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

function tarWrite(stream: import('node:stream').Writable, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(buffer, (error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

// 把磁盘文件作为 tar 条目写入（名称固定，内容按 512 对齐补零）
async function writeTarEntry(stream: import('node:stream').Writable, name: string, filePath: string): Promise<void> {
  const info = await stat(filePath);
  await tarWrite(stream, tarHeader(name, info.size));
  await pipeline(createReadStream(filePath), stream, { end: false });
  const pad = TAR_BLOCK - (info.size % TAR_BLOCK);
  if (pad < TAR_BLOCK) await tarWrite(stream, Buffer.alloc(pad));
}

// 打包「数据库 gz + 清单 CSV」为 tar.gz；需要加密时对 tar.gz 整体再加 AES-256-GCM
async function buildFullArchive(
  dumpPath: string,
  manifestPath: string,
  outputPath: string,
  encrypt: boolean,
): Promise<void> {
  const plainPath = `${outputPath}.plain.tmp`;
  const tarOut = createWriteStream(plainPath);
  await writeTarEntry(tarOut, 'database.sql.gz', dumpPath);
  await writeTarEntry(tarOut, 'manifest.csv', manifestPath);
  await tarWrite(tarOut, Buffer.alloc(TAR_BLOCK * 2)); // 结束块
  await new Promise<void>((resolve, reject) => tarOut.end((error?: Error | null) => (error ? reject(error) : resolve())));

  try {
    if (!encrypt) {
      // gzip 压缩到最终文件
      await pipeline(createReadStream(plainPath), createGzip(), createWriteStream(outputPath));
    } else {
      const passphrase = env.BACKUP_ENCRYPTION_PASSPHRASE as string;
      const salt = randomBytes(SALT_LENGTH);
      const iv = randomBytes(IV_LENGTH);
      const key = scryptSync(passphrase, salt, KEY_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const tagAppender = new Transform({
        transform(chunk, _encoding, callback) { callback(null, chunk); },
        flush(callback) { callback(null, cipher.getAuthTag()); },
      });
      const destination = createWriteStream(outputPath);
      destination.write(Buffer.concat([MAGIC, salt, iv]));
      await pipeline(createReadStream(plainPath), createGzip(), cipher, tagAppender, destination);
    }
  } finally {
    await unlink(plainPath).catch(() => undefined);
  }
}

// 执行完整备份：数据库全量 + 图片清单合并为一个文件（.tar.gz，含 database.sql.gz 与 manifest.csv）。
// 一条备份记录对应一个归档文件，页面上的一键备份 / 每日自动备份均走此入口。
export async function runFullBackup(trigger: BackupTrigger) {
  const fileName = `fabric-erp-full-${timestamp()}.tar.gz${env.BACKUP_ENCRYPTION_PASSPHRASE ? '.gpg' : ''}`;
  const filePath = path.join(backupRoot, fileName);
  const encrypted = Boolean(env.BACKUP_ENCRYPTION_PASSPHRASE);
  const tmpDumpPath = path.join(backupRoot, `tmp-full-${Date.now()}.sql.gz`);
  const tmpManifestPath = path.join(backupRoot, `tmp-full-${Date.now()}.csv`);

  const record = await prisma.backupRecord.create({
    data: {
      type: BackupType.FULL,
      trigger,
      status: BackupStatus.RUNNING,
      fileName,
      filePath,
      encrypted,
      protected: trigger === BackupTrigger.MANUAL,
    },
  });

  try {
    const db = parseDatabaseUrl(env.DATABASE_URL);
    const dumpCommand = {
      cmd: env.PG_DUMP_PATH,
      args: ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '--no-owner', '--no-acl'],
      env: { PGPASSWORD: db.password } as NodeJS.ProcessEnv,
    };

    await runDatabasePipeline(dumpCommand, tmpDumpPath, false);
    await writeFile(tmpManifestPath, await buildManifestContent(), 'utf8');
    await buildFullArchive(tmpDumpPath, tmpManifestPath, filePath, encrypted);

    const tableStats = await collectExactTableStats();
    const fileStat = await stat(filePath);

    await uploadBackupFile(record.id, filePath, fileName);

    return await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        status: BackupStatus.SUCCESS,
        fileSize: BigInt(fileStat.size),
        tableStats: tableStats as Prisma.InputJsonValue,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    const message = (error as Error).message.slice(0, 1000);
    return await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: BackupStatus.FAILED, errorMessage: message, finishedAt: new Date() },
    });
  } finally {
    await unlink(tmpDumpPath).catch(() => undefined);
    await unlink(tmpManifestPath).catch(() => undefined);
  }
}

// 清理超过保留期的备份文件。
// 保护规则：手动触发（protected）的备份、以及最近一次成功的数据库备份永不删除。
export async function cleanupExpiredBackups(retainDays = env.BACKUP_RETAIN_DAYS) {
  const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000);

  const latestSuccess = await prisma.backupRecord.findFirst({
    where: { type: { in: [BackupType.DATABASE, BackupType.FULL] }, status: BackupStatus.SUCCESS },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });

  const candidates = await prisma.backupRecord.findMany({
    where: {
      startedAt: { lt: cutoff },
      protected: false,
      status: { in: [BackupStatus.SUCCESS, BackupStatus.FAILED] },
      ...(latestSuccess ? { id: { not: latestSuccess.id } } : {}),
    },
  });

  const removed: string[] = [];
  for (const item of candidates) {
    await unlink(item.filePath).catch(() => undefined);
    await prisma.backupRecord.delete({ where: { id: item.id } });
    removed.push(item.fileName);
  }
  return removed;
}

// 启动时把残留的 RUNNING 记录标记为失败：进程重启后这些任务已不可能完成
export async function reconcileStaleBackups() {
  const result = await prisma.backupRecord.updateMany({
    where: { status: BackupStatus.RUNNING },
    data: {
      status: BackupStatus.FAILED,
      errorMessage: '任务被中断（服务重启）',
      finishedAt: new Date(),
    },
  });
  return result.count;
}

// 读取备份目录实际占用，供 UI 展示
export async function getBackupDiskUsage() {
  const files = await readdir(backupRoot).catch(() => [] as string[]);
  let total = 0;
  for (const file of files) {
    const info = await stat(path.join(backupRoot, file)).catch(() => null);
    if (info?.isFile()) total += info.size;
  }
  return { fileCount: files.length, totalBytes: total };
}

export { backupRoot };
