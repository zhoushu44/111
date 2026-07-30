-- 补充供应商档案遗漏字段（对照老式 ERP 截图第二轮核对）
-- 基本资料补充
ALTER TABLE "provider" ADD COLUMN "chinese_short_name" VARCHAR(100),  -- 中文简称
ADD COLUMN "business_unit" VARCHAR(150),                               -- 经营单位
ADD COLUMN "city" VARCHAR(100),                                        -- 城市
ADD COLUMN "is_silk_supplier" BOOLEAN DEFAULT false,                   -- 是否供应绢
ADD COLUMN "invoice_days" INTEGER;                                     -- 发票天数
-- 开票资料补充
ALTER TABLE "provider" ADD COLUMN "invoice_no" VARCHAR(100);           -- 票号
