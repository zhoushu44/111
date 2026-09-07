-- 补齐原系统(HSTIP)面料资料维护/面料查询列：纱支、密度、色号、产品描述
-- 数据来源：《敏群面料资料截至20260701（最终版）.xlsx》
--   E 纱支 -> yarn_count, F 密度 -> density, L 色号 -> color_no, P 产品描述 -> product_description
-- 原“产品备注”(H列)历史导入数据位于 remark 字段，保持不动。

-- AddColumn
ALTER TABLE "material_fabric" ADD COLUMN     "color_no" VARCHAR(100);

-- AddColumn
ALTER TABLE "material_fabric" ADD COLUMN     "yarn_count" VARCHAR(255);

-- AddColumn
ALTER TABLE "material_fabric" ADD COLUMN     "density" VARCHAR(100);

-- AddColumn
ALTER TABLE "material_fabric" ADD COLUMN     "product_description" VARCHAR(500);
