#!/usr/bin/env node
/* eslint-disable */
/**
 * 存量图片迁移脚本：本地 uploads/ -> 对象存储 images/，并把数据库 url 改为 COS URL。
 * 可断点续跑（以数据库 url 是否已为 http 开头为准）。
 * 用法：node migrate-images-to-cos.cjs [--limit=N] [--dry-run]
 */
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const requireSvc = require('./dist/services/storage-config.service.js');
const { getStorageConfig, createClient } = requireSvc;

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
const CONCURRENCY = 5;
const uploadRoot = process.env.UPLOAD_DIR || '/app/uploads';
const materialDir = path.join(uploadRoot, 'materials');

async function main() {
  const rows = await prisma.materialImage.findMany({
    where: { url: { not: { startsWith: 'http' } } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, url: true, thumbnailUrl: true },
  });
  const targets = limit > 0 ? rows.slice(0, limit) : rows;
  console.log(`待迁移图片：${targets.length} / 总本地 ${rows.length}${dryRun ? '（dry-run）' : ''}`);
  if (targets.length === 0) return;

  const config = await getStorageConfig();
  if (!config.enabled || !config.configured) throw new Error('对象存储未启用/未配置');
  const client = createClient(config);
  const base = config.domain
    ? config.domain.replace(/\/+$/, '')
    : `https://${config.bucket}.cos.${config.region}.myqcloud.com`;

  let done = 0, failed = 0, missing = 0;
  const busy = new Set();

  await new Promise((resolve) => {
    let idx = 0;
    const next = () => {
      if (idx >= targets.length) return void (!busy.size && resolve());
      const row = targets[idx++];
      busy.add(row.id);
      task(row)
        .catch((e) => {
          failed++;
          console.error(`[${row.id}] 失败：${e && e.message}`);
        })
        .finally(() => {
          busy.delete(row.id);
          done++;
          if (done % 200 === 0) console.log(`进度 ${done}/${targets.length} 失败 ${failed} 缺文件 ${missing}`);
          setImmediate(next);
        });
    };
    for (let i = 0; i < Math.min(CONCURRENCY, targets.length); i++) next();
  });

  console.log(`完成：迁移 ${done}，失败 ${failed}，本地缺文件 ${missing}`);

  async function ensureUpload(key, filePath) {
    if (!fs.existsSync(filePath)) {
      missing++;
      return null;
    }
    await client.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: 'image/webp',
    });
    return `${base}/${key}`;
  }

  async function task(row) {
    const name = path.basename(row.url);
    const localPath = path.join(materialDir, name);
    let url = null;
    if (!dryRun) url = await ensureUpload(`images/${name}`, localPath);
    if (dryRun) { fs.existsSync(localPath) || missing++; url = `${base}/images/${name}`; }

    let thumbnailUrl = row.thumbnailUrl;
    if (row.thumbnailUrl && !row.thumbnailUrl.startsWith('http')) {
      const thumbName = path.basename(row.thumbnailUrl);
      let thumb = null;
      if (!dryRun) thumb = await ensureUpload(`images/${thumbName}`, path.join(materialDir, thumbName));
      else { fs.existsSync(path.join(materialDir, thumbName)) || missing++; thumb = `${base}/images/${thumbName}`; }
      if (thumb) thumbnailUrl = thumb;
    }

    if (!dryRun && url) {
      await prisma.materialImage.update({
        where: { id: row.id },
        data: { url, ...(thumb_changed(thumbnailUrl, row.thumbnailUrl) ? { thumbnailUrl } : {}) },
      });
    }
  }

  function thumb_changed(next, prev) {
    return Boolean(next) && next !== prev;
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
