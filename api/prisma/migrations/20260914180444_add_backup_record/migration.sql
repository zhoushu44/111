-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('DATABASE', 'MANIFEST');

-- CreateEnum
CREATE TYPE "BackupTrigger" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- DropIndex（幂等：老库可能未创建该索引）
DROP INDEX IF EXISTS "customer_salesman_idx";

-- CreateTable
CREATE TABLE "backup_record" (
    "id" UUID NOT NULL,
    "type" "BackupType" NOT NULL,
    "trigger" "BackupTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "BackupStatus" NOT NULL DEFAULT 'RUNNING',
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "table_stats" JSONB,
    "error_message" VARCHAR(1000),
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_record_status_started_at_idx" ON "backup_record"("status", "started_at");

-- CreateIndex
CREATE INDEX "backup_record_type_started_at_idx" ON "backup_record"("type", "started_at");
