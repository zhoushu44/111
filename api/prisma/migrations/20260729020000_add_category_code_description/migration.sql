-- Add code and description fields to material_category.
ALTER TABLE "material_category" ADD COLUMN "code" VARCHAR(50),
ADD COLUMN "description" VARCHAR(500);

-- Create a unique constraint on code (multiple NULLs allowed in PostgreSQL).
CREATE UNIQUE INDEX "material_category_code_key" ON "material_category" ("code");
