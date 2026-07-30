-- CreateTable
CREATE TABLE "material_change_log" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "user_id" UUID,
    "user_display_name" VARCHAR(100),
    "action" VARCHAR(50) NOT NULL,
    "field" VARCHAR(50),
    "field_label" VARCHAR(50),
    "old_value" VARCHAR(500),
    "new_value" VARCHAR(500),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_change_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material_change_log" ADD CONSTRAINT "material_change_log_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material_fabric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "material_change_log_material_id_created_at_idx" ON "material_change_log"("material_id", "created_at");
