// 定时自动备份调度器：进程启动即开始，每分钟检查一次是否到达备份时间。
// 设计要点：
//  1. 时间用服务器本地时区（部署环境建议 TZ=Asia/Shanghai）。
//  2. 「错过补跑」：不依赖精确分钟命中，只要当天已过配置时间且当天尚无自动备份即触发，
//     应对服务器在备份时间点恰好重启的情况。
//  3. 同一时刻并发安全：触发前先原子占用（updateMany限 0/1 行），避免多实例重复备份。
import { prisma } from '../lib/prisma.js';
import { BackupTrigger } from '@prisma/client';
import { BACKUP_SCHEDULE_TYPE, getBackupSchedule } from './backup-schedule.service.js';
import { cleanupExpiredBackups, runFullBackup } from './backup.service.js';

const CHECK_INTERVAL_MS = 60_000;

let lastTriggeredDate = ''; // 本地日期字符串，进程内防重跑（同时由数据库判断兜底）

// 原子占位：保证当天（跨多进程/多实例也只有一方）触发一次自动备份。
// 行值 != today 时才更新成功；失败（备份异常）时清空占位让下一个检查周期重试。
async function claimDate(today: string): Promise<boolean> {
  await prisma.dataDictionary.upsert({
    where: { type_code: { type: BACKUP_SCHEDULE_TYPE, code: 'LAST_AUTO_DATE' } },
    update: {},
    create: { type: BACKUP_SCHEDULE_TYPE, code: 'LAST_AUTO_DATE', label: '最近自动备份日期', value: '', sortOrder: 3, status: 'ACTIVE' },
  });
  const claimed = await prisma.dataDictionary.updateMany({
    where: { type: BACKUP_SCHEDULE_TYPE, code: 'LAST_AUTO_DATE', value: { not: today } },
    data: { value: today },
  });
  return claimed.count === 1;
}

async function releaseDate(today: string) {
  await prisma.dataDictionary
    .updateMany({ where: { type: BACKUP_SCHEDULE_TYPE, code: 'LAST_AUTO_DATE', value: today }, data: { value: '' } })
    .catch(() => undefined);
}

function localDateOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function runAutoBackup() {
  console.log(`[backup-scheduler] 开始自动完整备份（数据库 + 图片清单）：${new Date().toLocaleString()}`);
  await runFullBackup(BackupTrigger.AUTO);
  await cleanupExpiredBackups().catch((error) => console.warn('[backup-scheduler] 清理过期备份失败：', error));
  console.log('[backup-scheduler] 自动备份完成');
}

async function checkOnce() {
  const schedule = await getBackupSchedule();
  if (!schedule.enabled) return;

  const now = new Date();
  const [hour, minute] = schedule.time.split(':').map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hour, minute, 0, 0);
  if (now < scheduled) return; // 还没到当天的备份时间

  const today = localDateOf(scheduled);
  if (lastTriggeredDate === today) return; // 本进程今天已跑过
  if (!(await claimDate(today))) return; // 其他进程已占用今天

  lastTriggeredDate = today;
  try {
    await runAutoBackup();
  } catch (error) {
    console.error('[backup-scheduler] 自动备份失败：', error);
    await releaseDate(today); // 失败释放占位，下个检查周期重试
  }
}

export function startBackupScheduler() {
  // 启动先跑一次（处理重启错过的时间点），之后每分钟检查
  setTimeout(() => {
    checkOnce().catch((error) => console.error('[backup-scheduler] 检查失败：', error));
    setInterval(() => checkOnce().catch((error) => console.error('[backup-scheduler] 检查失败：', error)), CHECK_INTERVAL_MS);
  }, 15_000);
  console.log('[backup-scheduler] 定时自动备份调度器已启动（每分钟检查）');
}
