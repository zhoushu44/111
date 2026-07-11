-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "device_name" VARCHAR(255),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "parent_id" UUID,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact" VARCHAR(100),
    "phone" VARCHAR(50),
    "address" VARCHAR(255),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact" VARCHAR(100),
    "phone" VARCHAR(50),
    "address" VARCHAR(255),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_location" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_fabric" (
    "id" UUID NOT NULL,
    "item_no" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "specification" VARCHAR(255),
    "composition" VARCHAR(255),
    "construction" VARCHAR(255),
    "width" VARCHAR(100),
    "weight" VARCHAR(100),
    "color" VARCHAR(100),
    "unit" VARCHAR(20) NOT NULL DEFAULT '米',
    "remark" VARCHAR(500),
    "label_remark" VARCHAR(500),
    "cost" DECIMAL(12,2),
    "category_id" UUID NOT NULL,
    "provider_id" UUID,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_fabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_image" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "thumbnail_url" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_choose" (
    "id" UUID NOT NULL,
    "document_no" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "remark" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),

    CONSTRAINT "sample_choose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_choose_item" (
    "id" UUID NOT NULL,
    "sample_choose_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "item_no_snapshot" VARCHAR(100) NOT NULL,
    "name_snapshot" VARCHAR(150) NOT NULL,
    "spec_snapshot" VARCHAR(255),
    "quantity" INTEGER NOT NULL,
    "remark" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_choose_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_in" (
    "id" UUID NOT NULL,
    "document_no" VARCHAR(50) NOT NULL,
    "remark" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_in_item" (
    "id" UUID NOT NULL,
    "sample_in_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_in_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_out" (
    "id" UUID NOT NULL,
    "document_no" VARCHAR(50) NOT NULL,
    "remark" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_out_item" (
    "id" UUID NOT NULL,
    "sample_out_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_out_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_stock" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_log" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(100),
    "detail" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_dictionary" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "value" VARCHAR(255),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_username_key" ON "user_account"("username");

-- CreateIndex
CREATE INDEX "user_account_role_id_idx" ON "user_account"("role_id");

-- CreateIndex
CREATE INDEX "user_session_user_id_expires_at_idx" ON "user_session"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_category_name_key" ON "material_category"("name");

-- CreateIndex
CREATE INDEX "material_category_parent_id_status_idx" ON "material_category"("parent_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_code_key" ON "provider"("code");

-- CreateIndex
CREATE INDEX "provider_name_idx" ON "provider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_code_key" ON "customer"("code");

-- CreateIndex
CREATE INDEX "customer_name_idx" ON "customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sample_location_code_key" ON "sample_location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "material_fabric_item_no_key" ON "material_fabric"("item_no");

-- CreateIndex
CREATE INDEX "material_fabric_name_idx" ON "material_fabric"("name");

-- CreateIndex
CREATE INDEX "material_fabric_category_id_idx" ON "material_fabric"("category_id");

-- CreateIndex
CREATE INDEX "material_fabric_provider_id_idx" ON "material_fabric"("provider_id");

-- CreateIndex
CREATE INDEX "material_image_material_id_sort_order_idx" ON "material_image"("material_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "sample_choose_document_no_key" ON "sample_choose"("document_no");

-- CreateIndex
CREATE INDEX "sample_choose_customer_id_created_at_idx" ON "sample_choose"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "sample_choose_created_by_id_created_at_idx" ON "sample_choose"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "sample_choose_item_material_id_idx" ON "sample_choose_item"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "sample_choose_item_sample_choose_id_material_id_key" ON "sample_choose_item"("sample_choose_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "sample_in_document_no_key" ON "sample_in"("document_no");

-- CreateIndex
CREATE INDEX "sample_in_created_by_id_created_at_idx" ON "sample_in"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "sample_in_item_material_id_location_id_idx" ON "sample_in_item"("material_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "sample_out_document_no_key" ON "sample_out"("document_no");

-- CreateIndex
CREATE INDEX "sample_out_created_by_id_created_at_idx" ON "sample_out"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "sample_out_item_material_id_location_id_idx" ON "sample_out_item"("material_id", "location_id");

-- CreateIndex
CREATE INDEX "sample_stock_location_id_idx" ON "sample_stock"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "sample_stock_material_id_location_id_key" ON "sample_stock"("material_id", "location_id");

-- CreateIndex
CREATE INDEX "operation_log_user_id_created_at_idx" ON "operation_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "operation_log_resource_created_at_idx" ON "operation_log"("resource", "created_at");

-- CreateIndex
CREATE INDEX "data_dictionary_type_status_idx" ON "data_dictionary"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "data_dictionary_type_code_key" ON "data_dictionary"("type", "code");

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_category" ADD CONSTRAINT "material_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "material_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_fabric" ADD CONSTRAINT "material_fabric_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_fabric" ADD CONSTRAINT "material_fabric_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_image" ADD CONSTRAINT "material_image_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material_fabric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_choose" ADD CONSTRAINT "sample_choose_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_choose" ADD CONSTRAINT "sample_choose_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_choose_item" ADD CONSTRAINT "sample_choose_item_sample_choose_id_fkey" FOREIGN KEY ("sample_choose_id") REFERENCES "sample_choose"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_choose_item" ADD CONSTRAINT "sample_choose_item_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material_fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_in" ADD CONSTRAINT "sample_in_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_in_item" ADD CONSTRAINT "sample_in_item_sample_in_id_fkey" FOREIGN KEY ("sample_in_id") REFERENCES "sample_in"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_in_item" ADD CONSTRAINT "sample_in_item_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material_fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_in_item" ADD CONSTRAINT "sample_in_item_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "sample_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_out" ADD CONSTRAINT "sample_out_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_out_item" ADD CONSTRAINT "sample_out_item_sample_out_id_fkey" FOREIGN KEY ("sample_out_id") REFERENCES "sample_out"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_out_item" ADD CONSTRAINT "sample_out_item_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material_fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_out_item" ADD CONSTRAINT "sample_out_item_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "sample_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_stock" ADD CONSTRAINT "sample_stock_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material_fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_stock" ADD CONSTRAINT "sample_stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "sample_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_log" ADD CONSTRAINT "operation_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
