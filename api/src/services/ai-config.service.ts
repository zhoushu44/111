import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

// AI 视觉识别配置项：复用 DataDictionary 表，type = AI_VISION
// 避免新增数据库表与迁移；存储为普通字典项，由专用路由与设置页管理。
export const AI_CONFIG_TYPE = 'AI_VISION';
const AI_CONFIG_KEYS = ['AI_VISION_API_KEY', 'AI_VISION_BASE_URL', 'AI_VISION_MODEL'] as const;
type AiConfigKey = (typeof AI_CONFIG_KEYS)[number];

export interface AiVisionConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean; // 是否已有有效 key
}

const DEFAULTS: Record<AiConfigKey, string> = {
  AI_VISION_API_KEY: '',
  AI_VISION_BASE_URL: 'https://api.openai.com/v1',
  AI_VISION_MODEL: 'gpt-4o',
};

/** 读取 AI 视觉配置：优先数据库，回退 process.env，再回退默认值。 */
export async function getAiVisionConfig(): Promise<AiVisionConfig> {
  const rows = await prisma.dataDictionary.findMany({
    where: { type: AI_CONFIG_TYPE, code: { in: [...AI_CONFIG_KEYS] } },
    select: { code: true, value: true, status: true },
  });
  const map = new Map(rows.map((r) => [r.code, r]));
  const get = (key: AiConfigKey) => {
    const row = map.get(key);
    // 仅启用状态的字典项才生效
    const dbVal = row && row.status === 'ACTIVE' ? (row.value ?? '') : '';
    return dbVal || process.env[key] || DEFAULTS[key];
  };
  const apiKey = get('AI_VISION_API_KEY');
  const baseUrl = get('AI_VISION_BASE_URL');
  const model = get('AI_VISION_MODEL');
  return { apiKey, baseUrl, model, configured: !!apiKey };
}

/** 脱敏密钥：仅展示首尾，中间用 * 替换，用于前端回显。 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 24))}${key.slice(-4)}`;
}

export interface AiVisionConfigInput {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function parseIpv6(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  const normalized = address.toLowerCase();
  const dottedIndex = normalized.lastIndexOf(':');
  let expanded = normalized;
  if (normalized.includes('.')) {
    const octets = normalized.slice(dottedIndex + 1).split('.').map(Number);
    expanded = `${normalized.slice(0, dottedIndex)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const [left, right] = expanded.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const zeroCount = 8 - leftParts.length - rightParts.length;
  const parts = right === undefined
    ? leftParts
    : [...leftParts, ...Array(zeroCount).fill('0'), ...rightParts];
  return parts.length === 8 ? parts.map((part) => Number.parseInt(part, 16)) : null;
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
      || (a === 203 && b === 0 && c === 113)
      || a >= 224;
  }
  const parts = parseIpv6(address);
  if (parts) {
    const [first, second] = parts;
    if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
      return isPrivateAddress(`${parts[6] >> 8}.${parts[6] & 0xff}.${parts[7] >> 8}.${parts[7] & 0xff}`);
    }
    return parts.every((part) => part === 0)
      || parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1
      || (first & 0xfe00) === 0xfc00
      || (first & 0xffc0) === 0xfe80
      || (first & 0xff00) === 0xff00
      || first === 0x2001 && second === 0x0db8;
  }
  return true;
}

async function resolveAiBaseUrl(value: string): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new HttpError(400, '接口地址不是有效 URL'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new HttpError(400, '接口地址仅支持 HTTP 或 HTTPS');
  if (url.username || url.password) throw new HttpError(400, '接口地址不能包含用户名或密码');
  if (url.port && url.port !== '80' && url.port !== '443') throw new HttpError(400, '接口地址仅允许标准 HTTP/HTTPS 端口');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || !hostname.includes('.') && !isIP(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.lan') || hostname.endsWith('.home') || hostname.endsWith('.corp')) {
    throw new HttpError(400, '接口地址不能指向本机或内网主机');
  }
  let addresses: LookupAddress[];
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); } catch { throw new HttpError(400, '接口地址主机无法解析'); }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new HttpError(400, '接口地址不能指向本机、私网或链路本地地址');
  url.hostname = hostname;
  url.hash = '';
  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family === 6 ? 6 : 4 };
}

export async function validateAiBaseUrl(value: string): Promise<string> {
  const { url } = await resolveAiBaseUrl(value);
  return url.toString().replace(/\/$/, '');
}

export interface AiJsonResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export async function postAiJson(baseUrl: string, pathname: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<AiJsonResponse> {
  const { url: base, address, family } = await resolveAiBaseUrl(baseUrl);
  const target = new URL(`${base.toString().replace(/\/$/, '')}/${pathname.replace(/^\//, '')}`);
  const payload = JSON.stringify(body);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;

  return await new Promise<AiJsonResponse>((resolve, reject) => {
    let settled = false;
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const req = request(target, {
      method: 'POST',
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${apiKey}`,
      },
      lookup: (_hostname, _options, callback) => callback(null, address, family),
      servername: target.hostname,
      timeout: 15000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        if (settled) return;
        settled = true;
        const responseText = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          text: async () => responseText,
          json: async <T>() => JSON.parse(responseText) as T,
        });
      });
      res.on('error', finishReject);
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', finishReject);

    const abort = () => req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('请求已取消'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    req.on('close', () => signal?.removeEventListener('abort', abort));

    req.end(payload);
  });
}

/**
 * 保存 AI 视觉配置（upsert 到 DataDictionary）。
 * 若 apiKey 传入的是脱敏占位（含 *），视为未修改，跳过该字段保留原值，
 * 这样用户只调整 baseUrl/model 时无需重新输入密钥。
 */
export async function saveAiVisionConfig(input: AiVisionConfigInput) {
  const skipKey = /\*/.test(input.apiKey);
  const baseUrl = await validateAiBaseUrl(input.baseUrl);
  const items: { code: AiConfigKey; label: string; value: string; sortOrder: number; skip?: boolean }[] = [
    { code: 'AI_VISION_API_KEY', label: 'AI 视觉密钥', value: input.apiKey.trim(), sortOrder: 1, skip: skipKey },
    { code: 'AI_VISION_BASE_URL', label: 'AI 视觉接口地址', value: baseUrl, sortOrder: 2 },
    { code: 'AI_VISION_MODEL', label: 'AI 视觉模型', value: input.model.trim(), sortOrder: 3 },
  ];
  await prisma.$transaction(items.filter((item) => !item.skip).map((item) => prisma.dataDictionary.upsert({
    where: { type_code: { type: AI_CONFIG_TYPE, code: item.code } },
    update: { value: item.value, label: item.label, sortOrder: item.sortOrder, status: 'ACTIVE' },
    create: { type: AI_CONFIG_TYPE, code: item.code, label: item.label, value: item.value, sortOrder: item.sortOrder, status: 'ACTIVE' },
  })));
}

/**
 * 测试 AI 视觉配置连通性：用给定配置发送一个最小请求（max_tokens=1）。
 * 仅验证鉴权与接口可达，不依赖具体返回内容。
 */
export async function testAiVision(input: AiVisionConfigInput): Promise<{ ok: boolean; message: string }> {
  const apiKey = input.apiKey.trim();
  const model = input.model.trim();
  if (!apiKey) throw new HttpError(400, '请填写 API Key');
  if (/\*/.test(apiKey)) throw new HttpError(400, '请填写完整的 API Key 再测试（当前为脱敏占位）');
  if (!input.baseUrl.trim()) throw new HttpError(400, '请填写接口地址');
  if (!model) throw new HttpError(400, '请填写模型名称');
  try {
    const resp = await postAiJson(
      input.baseUrl,
      '/chat/completions',
      apiKey,
      { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 },
      AbortSignal.timeout(15000),
    );
    if (resp.ok) return { ok: true, message: '连接成功，配置有效' };
    const text = await resp.text().catch(() => '');
    throw new HttpError(502, `AI 服务返回 ${resp.status}${text ? `：${text.slice(0, 200)}` : ''}`);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, `连接失败：${e instanceof Error ? e.message : '未知错误'}`);
  }
}
