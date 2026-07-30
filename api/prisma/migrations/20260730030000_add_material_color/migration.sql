-- CreateTable
CREATE TABLE "material_color" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "customer_color_no" VARCHAR(100),
    "color" VARCHAR(100),
    "processing_color_no" VARCHAR(100),
    "color_overview" VARCHAR(500),
    "color_weight" VARCHAR(100),
    "designer" VARCHAR(100),
    "provider_factory" VARCHAR(200),
    "order_customer" VARCHAR(200),
    "processing_fee" VARCHAR(100),
    "product" VARCHAR(200),
    "image" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_color_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_color_material_id_sort_order_idx" ON "material_color"("material_id", "sort_order");

-- AddForeignKey
ALTER TABLE "material_color" ADD CONSTRAINT "material_color_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material_fabric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
