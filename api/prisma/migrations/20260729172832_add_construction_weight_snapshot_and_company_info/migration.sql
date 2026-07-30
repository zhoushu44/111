-- AlterTable
ALTER TABLE "sample_choose_item" ADD COLUMN     "construction_snapshot" VARCHAR(255),
ADD COLUMN     "weight_snapshot" VARCHAR(100);

-- CreateTable
CREATE TABLE "company_info" (
    "id" TEXT NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(500),
    "phone" VARCHAR(50),
    "fax" VARCHAR(50),
    "logo_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_info_pkey" PRIMARY KEY ("id")
);
