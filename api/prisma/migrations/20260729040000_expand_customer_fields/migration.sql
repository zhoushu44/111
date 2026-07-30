-- 扩充客户档案字段（参考老式 ERP 客户资料维护页）
-- 基本资料
ALTER TABLE "customer" ADD COLUMN "short_name" VARCHAR(100),
ADD COLUMN "full_name" VARCHAR(200),
ADD COLUMN "type" VARCHAR(50),
ADD COLUMN "intermediary" VARCHAR(100),
ADD COLUMN "business_type" VARCHAR(100),
ADD COLUMN "salesman" VARCHAR(100),
ADD COLUMN "business_unit" VARCHAR(150),
ADD COLUMN "brand_name" VARCHAR(150),
ADD COLUMN "registered_at" DATE;
-- 业务信息
ALTER TABLE "customer" ADD COLUMN "monthly_settlement" BOOLEAN DEFAULT false,
ADD COLUMN "payment_days" INTEGER,
ADD COLUMN "credit_limit" DECIMAL(12, 2),
ADD COLUMN "main_products" VARCHAR(500),
ADD COLUMN "remark" VARCHAR(500);
-- 联系地址
ALTER TABLE "customer" ADD COLUMN "country" VARCHAR(50),
ADD COLUMN "province" VARCHAR(50),
ADD COLUMN "city" VARCHAR(50),
ADD COLUMN "postal_code" VARCHAR(20),
ADD COLUMN "shipping_address" VARCHAR(255);
-- 联系人
ALTER TABLE "customer" ADD COLUMN "general_manager" VARCHAR(100),
ADD COLUMN "mobile" VARCHAR(50),
ADD COLUMN "email" VARCHAR(100),
ADD COLUMN "fax" VARCHAR(50),
ADD COLUMN "other_contacts" VARCHAR(500);

-- 客户简称/销售人员常用筛选，加索引
CREATE INDEX "customer_short_name_idx" ON "customer" ("short_name");
CREATE INDEX "customer_salesman_idx" ON "customer" ("salesman");
