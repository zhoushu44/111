// 备份恢复脚本：将指定备份文件恢复到目标数据库。
//
// 用法：
//   npx tsx scripts/restore-backup.ts <备份文件名> --target-db <目标库名> [--yes]
//
// 安全设计：
//   1. 默认拒绝恢复到 DATABASE_URL 指向的库，必须显式传入目标库名，避免误覆盖生产数据。
//   2. 未加 --yes 时打印将要执行的操作并等待确认。
//   3. 加密备份自动识别并解密（需配置 BACKUP_ENCRYPTION_PASSPHRASE）。
//
// 恢复完成后请执行 `npx prisma migrate deploy` 确认迁移状态，再启动应用。
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { env } from '../src/config/env.js';
import { decryptBackupStream, verifyEncryptedBackup } from '../src/services/backup.service.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const fileName = args.find((a) => !a.startsWith('--'));
  const dbIndex = args.indexOf('--target-db');
  const targetDb = dbIndex >= 0 ? args[dbIndex + 1] : undefined;
  const yes = args.includes('--yes');
  if (!fileName) throw new Error('请指定备份文件名，例如：npx tsx scripts/restore-backup.ts fabric-erp-db-20260915.sql.gz');
  if (!targetDb) throw new Error('请通过 --target-db 指定目标数据库名（为避免误覆盖生产库，此项必填）');
  return { fileName, targetDb, yes };
}

// 从 DATABASE_URL 中取出当前生产库名，用于安全校验
function currentDatabaseName(): string {
  const parsed = new URL(env.DATABASE_URL);
  return parsed.pathname.replace(/^\//, '');
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

const { fileName, targetDb, yes } = parseArgs();
const filePath = path.isAbsolute(fileName) ? fileName : path.resolve(process.cwd(), env.BACKUP_DIR, fileName);

// 安全检查：禁止直接恢复到当前应用连接的库
if (targetDb === currentDatabaseName()) {
  console.error(`拒绝执行：目标库 "${targetDb}" 与当前应用连接的库相同，恢复会覆盖生产数据。`);
  console.error('如确需恢复，请显式指定另一个库名，或先停止应用并自行确认风险。');
  process.exit(1);
}

const isTarFile = fileName.endsWith('.tar.gz');

const info = await stat(filePath).catch(() => null);
if (!info) {
  console.error(`备份文件不存在：${filePath}`);
  process.exit(1);
}

const meta = await verifyEncryptedBackup(filePath);
console.log(`备份文件：${filePath}`);
console.log(`文件大小：${(info.size / 1024).toFixed(1)} KB`);
console.log(`加密状态：${meta.encrypted ? '已加密' : '未加密'}`);

if (meta.encrypted && !meta.readable) {
  console.error('该备份已加密，但服务端未配置 BACKUP_ENCRYPTION_PASSPHRASE 或口令不匹配，无法解密。');
  process.exit(1);
}

console.log(`\n即将把上述备份恢复到数据库：${targetDb}`);
if (!yes) {
  const ok = await confirm('确认继续请输入 yes：');
  if (!ok) {
    console.log('已取消。');
    process.exit(0);
  }
}

const db = new URL(env.DATABASE_URL);
const pgRestoreBin = path.join(path.dirname(env.PG_DUMP_PATH), 'psql.exe');
const psqlPath = process.platform === 'win32' ? pgRestoreBin : path.join(path.dirname(env.PG_DUMP_PATH), 'psql');

const psql = spawn(psqlPath, ['-h', db.hostname, '-p', db.port || '5432', '-U', decodeURIComponent(db.username), '-d', targetDb, '-q', '-v', 'ON_ERROR_STOP=1'], {
  stdio: ['pipe', 'inherit', 'pipe'],
  env: { ...process.env, PGPASSWORD: decodeURIComponent(db.password) },
});

const errs: string[] = [];
psql.stderr.on('data', (chunk: Buffer) => errs.push(chunk.toString()));

const done = new Promise<number>((resolve) => psql.on('close', (code) => resolve(code ?? 1)));

// 从 tar 字节流中提取指定成员（完整备份包内的 database.sql.gz），输出该成员的原始内容
function extractTarMember(input: NodeJS.ReadableStream, memberName: string): PassThrough {
  const out = new PassThrough();
  let buffer = Buffer.alloc(0);
  let currentMember: { name: string; size: number } | null = null;
  let ended = false;

  input.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (currentMember) {
        const { size, name } = currentMember;
        if (buffer.length < size + padBytes(size)) return;
        if (name === memberName) out.write(buffer.subarray(0, size));
        buffer = buffer.subarray(size + padBytes(size));
        currentMember = null;
        continue;
      }
      if (buffer.length < 512) return;
      const header = buffer.subarray(0, 512);
      if (header.every((b) => b === 0)) {
        if (!ended) { ended = true; out.end(); } // tar 结束块
        return;
      }
      const name = readTarName(header);
      const size = parseOctal(header.subarray(124, 136));
      buffer = buffer.subarray(512);
      currentMember = { name, size };
    }
  });
  input.on('end', () => { if (!ended) { ended = true; out.end(); } });
  input.on('error', (error) => out.destroy(error));
  return out;
}

function padBytes(size: number): number {
  const rem = size % 512;
  return rem === 0 ? 0 : 512 - rem;
}

function readTarName(header: Buffer): string {
  const nameField = header.subarray(0, 100);
  const end = nameField.indexOf(0);
  return nameField.subarray(0, end < 0 ? 100 : end).toString('utf8').replace(/\/+$/, '');
}

function parseOctal(buffer: Buffer): number {
  const text = buffer.toString('ascii').replace(/\0.*$/, '').trim();
  return text ? parseInt(text, 8) : 0;
}

if (isTarFile) {
  // 完整备份包：得到解压后的原始 tar 流，取出 database.sql.gz，再解压为 SQL 流
  const tarStream: NodeJS.ReadableStream = meta.encrypted
    ? await decryptBackupStream(filePath)
    : createReadStream(filePath).pipe(createGunzip());
  const memberStream = extractTarMember(tarStream, 'database.sql.gz');
  memberStream.pipe(createGunzip()).pipe(psql.stdin);
} else if (meta.encrypted) {
  const stream = await decryptBackupStream(filePath);
  stream.pipe(psql.stdin);
} else {
  createReadStream(filePath).pipe(createGunzip()).pipe(psql.stdin);
}

const code = await done;
if (code !== 0) {
  console.error('\n恢复失败：');
  console.error(errs.join('').slice(0, 2000));
  process.exit(1);
}

console.log(`\n恢复完成：数据已导入到 ${targetDb}`);
console.log('后续步骤：');
console.log('  1. npx prisma migrate deploy   # 确认迁移状态');
console.log('  2. 校验关键表行数是否与备份记录一致');
console.log('  3. 将应用 DATABASE_URL 指向该库后启动');
