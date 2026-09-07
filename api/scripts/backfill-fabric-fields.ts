// 回填原系统面料字段：纱支(E)->yarn_count, 密度(F)->density, 色号(L)->color_no, 产品描述(P)->product_description
// 数据源：《敏群面料资料截至20260701（最终版）(2).xlsx》，按 B列敏群编码 精确匹配 itemNo。
// 只写 4 个新字段，不碰其他任何字段。Excel无此编码的行：按 construction "纱支 / 密度" 拆分兜底。
import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/prisma.js';

const XLSX = 'E:\\360MoveData\\Users\\Administrator\\Desktop\\111\\敏群面料资料截至20260701（最终版）(2).xlsx';

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
    const t = String((v as { text: unknown }).text ?? '').trim();
    return t || null;
  }
  const s = String(v).trim();
  return s || null;
};

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const sheet = wb.worksheets[0];
  // 第1行为表头：A类别 B编码 C成分 D幅宽 E纱支 F密度 G克重 H产品备注 I成本 J工厂 K名称 L色号 M颜色 N规格 O加工 P描述 Q单位
  const byItem = new Map<string, { yarn: string | null; density: string | null; colorNo: string | null; desc: string | null }>();
  let dupes = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const itemNo = text(row.getCell(2).value);
    if (!itemNo) return;
    if (byItem.has(itemNo)) { dupes++; return; } // 同编码多行（多色号变体）：保留首行
    byItem.set(itemNo, {
      yarn: text(row.getCell(5).value),
      density: text(row.getCell(6).value),
      colorNo: text(row.getCell(12).value),
      desc: text(row.getCell(16).value),
    });
  });
  console.log(`excel rows: ${sheet.rowCount - 1}, distinct itemNo: ${byItem.size}, dupes skipped: ${dupes}`);

  const BATCH = 800;
  const entries = [...byItem.entries()];
  let matched = 0;
  let updatedCols = { yarn: 0, density: 0, colorNo: 0, desc: 0 };
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const [itemNo, f] of chunk) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(itemNo, f.yarn, f.density, f.colorNo, f.desc);
    }
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "material_fabric" m SET
        "yarn_count" = COALESCE(NULLIF(v.yarn, ''), m."yarn_count"),
        "density" = COALESCE(NULLIF(v.density, ''), m."density"),
        "color_no" = COALESCE(NULLIF(v.color_no, ''), m."color_no"),
        "product_description" = COALESCE(NULLIF(v.descr, ''), m."product_description")
      FROM (VALUES ${values.join(', ')}) AS v(item_no, yarn, density, color_no, descr)
      WHERE m."item_no" = v.item_no`,
      ...params,
    );
    matched += Number(result);
    if ((i / BATCH) % 10 === 0) console.log(`  batch ${i / BATCH + 1}/${Math.ceil(entries.length / BATCH)} matched so far: ${matched}`);
  }
  console.log(`excel-matched rows updated: ${matched}`);

  // 兜底：Excel没有的行（或Excel中纱支/密度为空的行），按 construction "纱支 / 密度" 拆分
  const fb1 = await prisma.$executeRawUnsafe(
    `UPDATE "material_fabric"
     SET "yarn_count" = NULLIF(split_part("construction", ' / ', 1), ''),
         "density" = NULLIF(split_part("construction", ' / ', 2), '')
     WHERE "construction" LIKE '% / %' AND ("yarn_count" IS NULL OR "density" IS NULL)`,
  );
  console.log(`construction-split fallback rows: ${fb1}`);

  const stats = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
    `SELECT COUNT(*) AS total,
      COUNT("yarn_count") AS yarn, COUNT("density") AS density,
      COUNT("color_no") AS color_no, COUNT("product_description") AS descr,
      COUNT("factory_no") AS factoryno, COUNT("composition") AS composition,
      COUNT("width") AS width, COUNT("weight") AS weight, COUNT("remark") AS remark
     FROM "material_fabric"`,
  );
  console.log('final fill stats:', JSON.stringify(stats[0], (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
