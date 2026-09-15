-- AlterTable
ALTER TABLE "backup_record" ADD COLUMN     "storage_key" VARCHAR(500),
ADD COLUMN     "upload_error" VARCHAR(1000),
ADD COLUMN     "uploaded" BOOLEAN NOT NULL DEFAULT false;
