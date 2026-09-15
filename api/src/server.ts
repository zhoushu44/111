import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { reconcileStaleBackups } from './services/backup.service.js';
import { startBackupScheduler } from './services/backup-scheduler.js';

const server = app.listen(env.PORT, '0.0.0.0', () => console.log(`API listening on 0.0.0.0:${env.PORT}`));

// 定时自动备份调度器
startBackupScheduler();

// 服务重启后，上一次未完成的备份任务不可能再继续：
// 标记为失败，避免列表中残留 RUNNING 记录阻塞后续备份触发。
reconcileStaleBackups()
  .then((count) => { if (count > 0) console.log(`[backup] 已标记 ${count} 个中断的备份任务为失败`); })
  .catch((error) => console.error('[backup] 清理中断备份任务失败', error));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
