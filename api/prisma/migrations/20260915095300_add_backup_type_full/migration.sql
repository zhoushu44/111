-- 新增备份类型 FULL：完整备份（数据库 + 图片清单合并为一个 tar.gz 包）
ALTER TYPE "BackupType" ADD VALUE IF NOT EXISTS 'FULL';
