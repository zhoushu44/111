-- 扩充供应商档案字段（参考老式 ERP 供应商维护页）
-- 基本资料
ALTER TABLE "provider" ADD COLUMN "short_name" VARCHAR(100),
ADD COLUMN "full_name" VARCHAR(200),
ADD COLUMN "type" VARCHAR(50),
ADD COLUMN "business_type" VARCHAR(100),
ADD COLUMN "is_monthly_settlement" BOOLEAN DEFAULT false,
ADD COLUMN "merchandiser" VARCHAR(100),
ADD COLUMN "payment_days" INTEGER,
ADD COLUMN "main_products" VARCHAR(500),
ADD COLUMN "equipment_capacity" VARCHAR(500);
-- 联系方式
ALTER TABLE "provider" ADD COLUMN "mobile" VARCHAR(50),
ADD COLUMN "email" VARCHAR(100),
ADD COLUMN "other_contacts" VARCHAR(500);
-- 开票资料（敏感）
ALTER TABLE "provider" ADD COLUMN "bank_name" VARCHAR(150),
ADD COLUMN "bank_account" VARCHAR(100),
ADD COLUMN "tax_id" VARCHAR(50),
ADD COLUMN "invoice_ratio" DECIMAL(5,2),
ADD COLUMN "invoice_note" VARCHAR(500),
ADD COLUMN "registered_address" VARCHAR(255);

-- 英文简称常用筛选，加索引
CREATE INDEX "provider_short_name_idx" ON "provider" ("short_name");
