// 备份定时调度：配置存 DataDictionary（type=BACKUP_SCHEDULE），与对象存储配置同一模式。
// 调度逻辑：每分钟检查一次；到达当天配置时间且当天尚无自动备份时触发（支持错过补跑）。
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

export const BACKUP_SCHEDULE_TYPE = 'BACKUP_SCHEDULE' as const;
const KEYS = ['AUTO_ENABLED', 'AUTO_TIME'] as const;
type ScheduleKey = (typeof KEYS)[number];

const DEFAULTS: Record<ScheduleKey, string> = {
  AUTO_ENABLED: 'false',
  AUTO_TIME: '03:00',
};

export interface BackupSchedule {
  enabled: boolean;
  /** 本地时间 HH:mm */
  time: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function getBackupSchedule(): Promise<BackupSchedule> {
  const rows = await prisma.dataDictionary.findMany({
    where: { type: BACKUP_SCHEDULE_TYPE, code: { in: [...KEYS] } },
    select: { code: true, value: true, status: true },
  });
  const map = new Map(rows.map((r) => [r.code, r]));
  const get = (code: ScheduleKey) => {
    const row = map.get(code);
    const dbVal = row && row.status === 'ACTIVE' ? (row.value ?? '') : '';
    return dbVal || DEFAULTS[code];
  };
  const time = get('AUTO_TIME');
  return { enabled: get('AUTO_ENABLED') === 'true', time: TIME_RE.test(time) ? time : DEFAULTS.AUTO_TIME };
}

export async function saveBackupSchedule(input: BackupSchedule): Promise<BackupSchedule> {
  const time = input.time.trim();
  if (!TIME_RE.test(time)) throw new HttpError(400, '备份时间格式应为 HH:mm（如 03:00）');
  const items: { code: ScheduleKey; label: string; value: string; sortOrder: number }[] = [
    { code: 'AUTO_ENABLED', label: '自动备份开关', value: input.enabled ? 'true' : 'false', sortOrder: 1 },
    { code: 'AUTO_TIME', label: '自动备份时间', value: time, sortOrder: 2 },
  ];
  await prisma.$transaction(
    items.map((item) =>
      prisma.dataDictionary.upsert({
        where: { type_code: { type: BACKUP_SCHEDULE_TYPE, code: item.code } },
        update: { value: item.value, label: item.label, sortOrder: item.sortOrder, status: 'ACTIVE' },
        create: {
          type: BACKUP_SCHEDULE_TYPE,
          code: item.code,
          label: item.label,
          value: item.value,
          sortOrder: item.sortOrder,
          status: 'ACTIVE',
        },
      }),
    ),
  );
  return { enabled: input.enabled, time };
}
