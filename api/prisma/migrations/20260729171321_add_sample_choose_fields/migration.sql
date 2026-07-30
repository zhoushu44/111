-- AlterTable
ALTER TABLE "material_fabric" ADD COLUMN     "factory_no" VARCHAR(100);

-- AlterTable
ALTER TABLE "sample_choose" ADD COLUMN     "contact" VARCHAR(100),
ADD COLUMN     "currency" VARCHAR(20) DEFAULT 'CNY',
ADD COLUMN     "express_company" VARCHAR(100),
ADD COLUMN     "express_no" VARCHAR(100),
ADD COLUMN     "printed_at" TIMESTAMP(3),
ADD COLUMN     "requirement" VARCHAR(500),
ADD COLUMN     "salesperson" VARCHAR(100),
ADD COLUMN     "sample_type" VARCHAR(50),
ADD COLUMN     "unsampled_type" VARCHAR(50);

-- AlterTable
ALTER TABLE "sample_choose_item" ADD COLUMN     "composition_snapshot" VARCHAR(255),
ADD COLUMN     "factory_no_snapshot" VARCHAR(100),
ADD COLUMN     "unit_snapshot" VARCHAR(20),
ADD COLUMN     "width_snapshot" VARCHAR(100);
