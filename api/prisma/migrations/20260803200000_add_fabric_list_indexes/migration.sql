-- 优化面料列表加载性能：为高频查询路径补充复合索引
--
-- 背景：列表默认 orderBy updatedAt desc，常带 status 过滤；前端类别筛选为高频场景。
-- 原 schema 仅有 name/categoryId/providerId 单列索引，updatedAt 排序走 Sort 算子，4万+条慢。
--
-- 使用 CONCURRENTLY 避免锁表，可与线上读写并发安全执行。
-- Prisma 会自动识别 CONCURRENTLY 不将其包入事务。

-- 列表默认排序 + 状态过滤
CREATE INDEX CONCURRENTLY "material_fabric_status_updated_at_idx"
  ON "material_fabric" ("status", "updated_at");

-- 类别筛选（前缀覆盖 categoryId 单字段查询）
CREATE INDEX CONCURRENTLY "material_fabric_category_id_status_updated_at_idx"
  ON "material_fabric" ("category_id", "status", "updated_at");
