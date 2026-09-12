-- 优化面料列表加载性能：为高频查询路径补充复合索引
--
-- 背景：列表默认 orderBy updatedAt desc，常带 status 过滤；前端类别筛选为高频场景。
-- 原 schema 仅有 name/categoryId/providerId 单列索引，updatedAt 排序走 Sort 算子，4万+条慢。
--
-- 注意：Prisma 迁移会在事务块中执行，CREATE INDEX CONCURRENTLY 不能在事务内运行，
-- 故此处使用普通 CREATE INDEX。线上大表如需并发建索引，请单独用 CONCURRENTLY 手工执行。

-- 列表默认排序 + 状态过滤
CREATE INDEX "material_fabric_status_updated_at_idx"
  ON "material_fabric" ("status", "updated_at");

-- 类别筛选（前缀覆盖 categoryId 单字段查询）
CREATE INDEX "material_fabric_category_id_status_updated_at_idx"
  ON "material_fabric" ("category_id", "status", "updated_at");
