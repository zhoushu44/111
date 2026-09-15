import COS from 'cos-nodejs-sdk-v5';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

// 对象存储配置：复用 DataDictionary 表，type = STORAGE
// 与 AI 视觉配置一致的做法，避免为此新增表与迁移。
export const STORAGE_CONFIG_TYPE = 'STORAGE';
const STORAGE_CONFIG_KEYS = [
  'STORAGE_ENABLED',
  'STORAGE_REGION',
  'STORAGE_BUCKET',
  'STORAGE_SECRET_ID',
  'STORAGE_SECRET_KEY',
  // 文件访问前缀，可填 CDN 域名或 COS 默认域名；留空则由 region+bucket 推导
  'STORAGE_DOMAIN',
] as const;
type StorageConfigKey = (typeof STORAGE_CONFIG_KEYS)[number];

export interface StorageConfig {
  enabled: boolean;
  region: string;
  bucket: string;
  secretId: string;
  secretKey: string;
  domain: string;
  configured: boolean;
}

const DEFAULTS: Record<StorageConfigKey, string> = {
  STORAGE_ENABLED: 'false',
  STORAGE_REGION: '',
  STORAGE_BUCKET: '',
  STORAGE_SECRET_ID: '',
  STORAGE_SECRET_KEY: '',
  STORAGE_DOMAIN: '',
};

/** 读取对象存储配置：优先数据库，回退 process.env，再回退默认值。 */
export async function getStorageConfig(): Promise<StorageConfig> {
  const rows = await prisma.dataDictionary.findMany({
    where: { type: STORAGE_CONFIG_TYPE, code: { in: [...STORAGE_CONFIG_KEYS] } },
    select: { code: true, value: true, status: true },
  });
  const map = new Map(rows.map((r) => [r.code, r]));
  const get = (key: StorageConfigKey) => {
    const row = map.get(key);
    const dbVal = row && row.status === 'ACTIVE' ? (row.value ?? '') : '';
    return dbVal || process.env[key] || DEFAULTS[key];
  };

  const region = get('STORAGE_REGION').trim();
  const bucket = get('STORAGE_BUCKET').trim();
  const secretId = get('STORAGE_SECRET_ID').trim();
  const secretKey = get('STORAGE_SECRET_KEY').trim();

  return {
    enabled: get('STORAGE_ENABLED') === 'true',
    region,
    bucket,
    secretId,
    secretKey,
    domain: get('STORAGE_DOMAIN').trim(),
    configured: Boolean(region && bucket && secretId && secretKey),
  };
}

export interface StorageConfigInput {
  enabled: boolean;
  region: string;
  bucket: string;
  secretId: string;
  secretKey: string;
  domain?: string;
}

/**
 * 保存对象存储配置。
 * 与 AI 配置一致：密钥传入脱敏占位（含 *）视为未修改，跳过该字段保留原值，
 * 使管理员仅调整开关或 bucket 时无需重新输入密钥。
 */
export async function saveStorageConfig(input: StorageConfigInput) {
  const region = input.region.trim();
  const bucket = input.bucket.trim();
  const secretId = input.secretId.trim();
  const secretKey = input.secretKey.trim();
  const skipSecretId = /\*/.test(secretId);
  const skipSecretKey = /\*/.test(secretKey);

  // 仅在启用时做完整性校验：关闭状态允许清空配置
  if (input.enabled) {
    if (!region) throw new HttpError(400, '请填写地域（Region）');
    if (!bucket) throw new HttpError(400, '请填写存储桶（Bucket）');
    if (!skipSecretId && !secretId) throw new HttpError(400, '请填写 SecretId');
    if (!skipSecretKey && !secretKey) throw new HttpError(400, '请填写 SecretKey');
  }

  const items: { code: StorageConfigKey; label: string; value: string; sortOrder: number; skip?: boolean }[] = [
    { code: 'STORAGE_ENABLED', label: '对象存储开关', value: input.enabled ? 'true' : 'false', sortOrder: 1 },
    { code: 'STORAGE_REGION', label: '对象存储地域', value: region, sortOrder: 2 },
    { code: 'STORAGE_BUCKET', label: '对象存储桶', value: bucket, sortOrder: 3 },
    { code: 'STORAGE_SECRET_ID', label: '对象存储 SecretId', value: secretId, sortOrder: 4, skip: skipSecretId },
    { code: 'STORAGE_SECRET_KEY', label: '对象存储 SecretKey', value: secretKey, sortOrder: 5, skip: skipSecretKey },
    { code: 'STORAGE_DOMAIN', label: '对象存储访问域名', value: (input.domain ?? '').trim(), sortOrder: 6 },
  ];

  await prisma.$transaction(
    items
      .filter((item) => !item.skip)
      .map((item) =>
        prisma.dataDictionary.upsert({
          where: { type_code: { type: STORAGE_CONFIG_TYPE, code: item.code } },
          update: { value: item.value, label: item.label, sortOrder: item.sortOrder, status: 'ACTIVE' },
          create: {
            type: STORAGE_CONFIG_TYPE,
            code: item.code,
            label: item.label,
            value: item.value,
            sortOrder: item.sortOrder,
            status: 'ACTIVE',
          },
        }),
      ),
  );
}

function createClient(config: StorageConfig, override?: Partial<StorageConfigInput>) {
  return new COS({
    SecretId: override?.secretId?.trim() || config.secretId,
    SecretKey: override?.secretKey?.trim() || config.secretKey,
    // 关闭 SDK 内部重试，由备份流程统一控制失败处理
    Timeout: 60_000,
  });
}

/**
 * 测试对象存储连通性：向桶内写入并立即删除一个探测对象。
 * 仅验证鉴权与写入权限，不会留下残留文件。
 */
export async function testStorage(input?: Partial<StorageConfigInput>): Promise<{ ok: boolean; message: string }> {
  const saved = await getStorageConfig();
  const region = (input?.region ?? saved.region).trim();
  const bucket = (input?.bucket ?? saved.bucket).trim();
  const secretId = (input?.secretId ?? saved.secretId).trim();
  const secretKey = (input?.secretKey ?? saved.secretKey).trim();

  if (!region) throw new HttpError(400, '请填写地域（Region）');
  if (!bucket) throw new HttpError(400, '请填写存储桶（Bucket）');
  if (!secretId || /\*/.test(secretId)) throw new HttpError(400, '请填写完整的 SecretId 再测试（当前为脱敏占位）');
  if (!secretKey || /\*/.test(secretKey)) throw new HttpError(400, '请填写完整的 SecretKey 再测试（当前为脱敏占位）');

  const client = createClient({ ...saved, region, bucket, secretId, secretKey });
  const key = `.healthcheck/${Date.now()}.txt`;

  try {
    await putObject(client, { Bucket: bucket, Region: region, Key: key, Body: 'ok' });
  } catch (error) {
    throw new HttpError(502, `写入失败：${describeCosError(error)}`);
  }

  try {
    const head = await headObject(client, { Bucket: bucket, Region: region, Key: key });
    const size = head.headers?.['content-length'];
    await deleteObject(client, { Bucket: bucket, Region: region, Key: key }).catch(() => undefined);
    return { ok: true, message: `连接成功，写入并读取正常${size ? `（${size} 字节）` : ''}。请确认该桶已开启版本控制。` };
  } catch (error) {
    await deleteObject(client, { Bucket: bucket, Region: region, Key: key }).catch(() => undefined);
    throw new HttpError(502, `读取失败：${describeCosError(error)}`);
  }
}

// COS SDK 的 Promise 包装：SDK 回调签名为 (err, data)
function putObject(client: COS, params: COS.PutObjectParams): Promise<COS.PutObjectResult> {
  return new Promise((resolve, reject) => {
    client.putObject(params, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function headObject(client: COS, params: COS.HeadObjectParams): Promise<COS.HeadObjectResult> {
  return new Promise((resolve, reject) => {
    client.headObject(params, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function deleteObject(client: COS, params: COS.DeleteObjectParams): Promise<COS.DeleteObjectResult> {
  return new Promise((resolve, reject) => {
    client.deleteObject(params, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

export function describeCosError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { statusCode?: number; code?: string; message?: string };
    const parts = [e.code, e.message].filter(Boolean).join('：');
    return `${parts || '未知错误'}${e.statusCode ? `（HTTP ${e.statusCode}）` : ''}`;
  }
  return error instanceof Error ? error.message : '未知错误';
}

export { createClient, putObject, headObject, deleteObject };

/** 对象存储内访问前缀：优先自定义域名，否则 COS 默认域名。 */
function publicBaseUrl(config: StorageConfig): string {
  if (config.domain) return config.domain.replace(/\/+$/, '');
  return `https://${config.bucket}.cos.${config.region}.myqcloud.com`;
}

export interface StorageUploadFile {
  /** 对象 key，如 images/xxx.webp */
  key: string;
  body: Buffer;
}

/**
 * 上传业务图片（原图/缩略图等 Buffer）到对象存储。
 * 全部成功返回对应的公网 URL 列表；未启用或上传失败返回 null（由调用方回退本地存储）。
 * 任一文件失败时回滚已上传的对象，避免残留半套文件。
 */
export async function uploadImagesToStorage(files: StorageUploadFile[]): Promise<string[] | null> {
  const config = await getStorageConfig();
  if (!config.enabled || !config.configured || files.length === 0) return null;

  const client = createClient(config);
  const base = publicBaseUrl(config);
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      await putObject(client, { Bucket: config.bucket, Region: config.region, Key: file.key, Body: file.body });
      uploaded.push(`${base}/${file.key}`);
    }
    return uploaded;
  } catch (error) {
    console.warn('[storage] 图片上传对象存储失败，回退本地存储：', describeCosError(error));
    await Promise.all(
      uploaded.map((url) => deleteFromStorage(url).catch(() => undefined)),
    );
    return null;
  }
}

/**
 * 删除对象存储中的图片（按已存的公网 URL）。
 * 仅处理指向本桶 / COS 默认域名的 URL；本地路径（/uploads/...）直接忽略。
 * 删除失败只告警不抛错，避免影响业务记录删除。
 */
export async function deleteFromStorage(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  const config = await getStorageConfig();
  if (!config.enabled || !config.configured) return;

  let host: string;
  let key: string;
  try {
    const parsed = new URL(url);
    host = parsed.host;
    key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return;
  }
  if (!key) return;

  // 兼容 COS 默认域名（可从主机名反推 bucket/region）与自定义访问域名
  const cosMatch = host.match(/^([^.]+)\.cos\.([^.]+)\.myqcloud\.com$/i);
  const isCosDefault = Boolean(cosMatch);
  const expectedHost = (() => {
    try {
      return new URL(publicBaseUrl(config)).host;
    } catch {
      return '';
    }
  })();
  if (!isCosDefault && host !== expectedHost) return;

  const bucket = isCosDefault ? cosMatch![1] : config.bucket;
  const region = isCosDefault ? cosMatch![2] : config.region;
  if (!bucket || !region) return;

  const client = createClient(config);
  try {
    await deleteObject(client, { Bucket: bucket, Region: region, Key: key });
  } catch (error) {
    console.warn('[storage] 删除对象存储图片失败：', describeCosError(error));
  }
}
