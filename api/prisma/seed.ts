import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, RecordStatus, RoleCode } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [adminRole, staffRole] = await Promise.all([
    prisma.role.upsert({
      where: { code: RoleCode.ADMIN },
      update: { name: '管理员', description: '系统管理员' },
      create: { code: RoleCode.ADMIN, name: '管理员', description: '系统管理员' },
    }),
    prisma.role.upsert({
      where: { code: RoleCode.STAFF },
      update: { name: '员工', description: '业务员工' },
      create: { code: RoleCode.STAFF, name: '员工', description: '业务员工' },
    }),
  ]);

  const [adminHash, staffHash] = await Promise.all([
    bcrypt.hash('zs1236547', 12),
    bcrypt.hash('Staff@123456', 12),
  ]);

  // 历史账号迁移：旧种子曾用用户名 admin，现统一改为 zhoushu。
  // 采用「重命名」而非「删除重建」，以保留原账号 id 及其关联的选样单/操作日志等数据，避免外键冲突。
  const legacyAdmin = await prisma.userAccount.findUnique({ where: { username: 'admin' } });
  if (legacyAdmin && !(await prisma.userAccount.findUnique({ where: { username: 'zhoushu' } }))) {
    await prisma.userAccount.update({
      where: { username: 'admin' },
      data: { username: 'zhoushu', displayName: '系统管理员', passwordHash: adminHash, roleId: adminRole.id },
    });
  }

  // 确保 zhoushu 管理员账号存在且凭据正确（幂等）
  await Promise.all([
    prisma.userAccount.upsert({
      where: { username: 'zhoushu' },
      update: { displayName: '系统管理员', passwordHash: adminHash, roleId: adminRole.id },
      create: { username: 'zhoushu', displayName: '系统管理员', passwordHash: adminHash, roleId: adminRole.id },
    }),
    prisma.userAccount.upsert({
      where: { username: 'staff' },
      update: { displayName: '业务员工', passwordHash: staffHash, roleId: staffRole.id },
      create: { username: 'staff', displayName: '业务员工', passwordHash: staffHash, roleId: staffRole.id },
    }),
  ]);

  const category = await prisma.materialCategory.upsert({
    where: { name: '针织面料' }, update: {}, create: { name: '针织面料', status: RecordStatus.ACTIVE, sortOrder: 1 },
  });
  const provider = await prisma.provider.upsert({
    where: { code: 'P001' }, update: { name: '华东纺织供应商' }, create: { code: 'P001', name: '华东纺织供应商', contact: '张经理', phone: '13800000000' },
  });
  await Promise.all([
    prisma.customer.upsert({
      where: { code: 'C001' }, update: { name: '上海示例客户' }, create: { code: 'C001', name: '上海示例客户', contact: '李女士', phone: '13900000000' },
    }),
    prisma.materialFabric.upsert({
      where: { itemNo: 'MQ-0001' },
      update: { name: '全棉针织面料', categoryId: category.id, providerId: provider.id },
      create: { itemNo: 'MQ-0001', name: '全棉针织面料', specification: '100% Cotton', color: '本白', cost: '25.00', categoryId: category.id, providerId: provider.id },
    }),
  ]);

  // 数据字典：面料资料维护的选项输入（对应老系统 HSTIP 下拉框）
  const dictionaryEntries: { type: string; code: string; label: string; sortOrder: number }[] = [
    // 单位
    { type: 'unit', code: '米', label: '米', sortOrder: 1 },
    { type: 'unit', code: '公斤', label: '公斤', sortOrder: 2 },
    { type: 'unit', code: '码', label: '码', sortOrder: 3 },
    { type: 'unit', code: '磅', label: '磅', sortOrder: 4 },
    { type: 'unit', code: '条', label: '条', sortOrder: 5 },
    { type: 'unit', code: '件', label: '件', sortOrder: 6 },
    { type: 'unit', code: '卷', label: '卷', sortOrder: 7 },
    // 面料成份
    { type: 'composition', code: '全棉', label: '全棉', sortOrder: 1 },
    { type: 'composition', code: 'CVC', label: 'CVC', sortOrder: 2 },
    { type: 'composition', code: 'T/C', label: 'T/C', sortOrder: 3 },
    { type: 'composition', code: '涤纶', label: '涤纶', sortOrder: 4 },
    { type: 'composition', code: '尼龙', label: '尼龙', sortOrder: 5 },
    { type: 'composition', code: '真丝', label: '真丝', sortOrder: 6 },
    { type: 'composition', code: '羊毛', label: '羊毛', sortOrder: 7 },
    { type: 'composition', code: '亚麻', label: '亚麻', sortOrder: 8 },
    { type: 'composition', code: '粘胶', label: '粘胶', sortOrder: 9 },
    { type: 'composition', code: '莫代尔', label: '莫代尔', sortOrder: 10 },
    { type: 'composition', code: '氨纶', label: '氨纶', sortOrder: 11 },
    // 面料来源
    { type: 'fabric_source', code: '客供样', label: '客供样', sortOrder: 1 },
    { type: 'fabric_source', code: '自购样', label: '自购样', sortOrder: 2 },
    { type: 'fabric_source', code: '工厂样', label: '工厂样', sortOrder: 3 },
    { type: 'fabric_source', code: '市场样', label: '市场样', sortOrder: 4 },
    // 加工方式
    { type: 'processing_method', code: '染色', label: '染色', sortOrder: 1 },
    { type: 'processing_method', code: '印花', label: '印花', sortOrder: 2 },
    { type: 'processing_method', code: '绣花', label: '绣花', sortOrder: 3 },
    { type: 'processing_method', code: '烫金', label: '烫金', sortOrder: 4 },
    { type: 'processing_method', code: '压花', label: '压花', sortOrder: 5 },
    { type: 'processing_method', code: '水洗', label: '水洗', sortOrder: 6 },
    { type: 'processing_method', code: '磨毛', label: '磨毛', sortOrder: 7 },
    { type: 'processing_method', code: '涂层', label: '涂层', sortOrder: 8 },
    // 币种（选样管理）
    { type: 'currency', code: 'CNY', label: '人民币', sortOrder: 1 },
    { type: 'currency', code: 'USD', label: '美元', sortOrder: 2 },
    { type: 'currency', code: 'EUR', label: '欧元', sortOrder: 3 },
    { type: 'currency', code: 'JPY', label: '日元', sortOrder: 4 },
    { type: 'currency', code: 'HKD', label: '港币', sortOrder: 5 },
    // 快递公司（选样管理）
    { type: 'express_company', code: 'SF', label: '顺丰速运', sortOrder: 1 },
    { type: 'express_company', code: 'DHL', label: 'DHL', sortOrder: 2 },
    { type: 'express_company', code: 'FedEx', label: 'FedEx', sortOrder: 3 },
    { type: 'express_company', code: 'UPS', label: 'UPS', sortOrder: 4 },
    { type: 'express_company', code: 'TNT', label: 'TNT', sortOrder: 5 },
    { type: 'express_company', code: 'EMS', label: 'EMS', sortOrder: 6 },
    // 选样类型
    { type: 'sample_type', code: 'NEW', label: '新样', sortOrder: 1 },
    { type: 'sample_type', code: 'REPEAT', label: '翻单', sortOrder: 2 },
    { type: 'sample_type', code: 'REWORK', label: '重做', sortOrder: 3 },
    { type: 'sample_type', code: 'TEST', label: '测试样', sortOrder: 4 },
    // 未样类型
    { type: 'unsampled_type', code: 'PENDING', label: '待送样', sortOrder: 1 },
    { type: 'unsampled_type', code: 'IN_TRANSIT', label: '在途', sortOrder: 2 },
    { type: 'unsampled_type', code: 'RECEIVED', label: '已收', sortOrder: 3 },
    { type: 'unsampled_type', code: 'RETURNED', label: '已退回', sortOrder: 4 },
  ];
  await Promise.all(
    dictionaryEntries.map((entry) =>
      prisma.dataDictionary.upsert({
        where: { type_code: { type: entry.type, code: entry.code } },
        update: { label: entry.label, sortOrder: entry.sortOrder, status: RecordStatus.ACTIVE },
        create: { type: entry.type, code: entry.code, label: entry.label, sortOrder: entry.sortOrder },
      })
    )
  );

  // 公司抬头单行配置（客户选样预览 QUOTATION LIST 使用）
  const existingCompany = await prisma.companyInfo.findFirst();
  const companyData = {
    companyName: 'Mint Chance Textile Co.,Ltd',
    address: 'Room 401-402 No.2,Lane 298 Tongtao Road.,Changning District,Shanghai 200335, China',
    phone: '+86-21-51876888',
    fax: '+86-21-52845389',
    logoUrl: null,
  };
  if (existingCompany) {
    await prisma.companyInfo.update({ where: { id: existingCompany.id }, data: companyData });
  } else {
    await prisma.companyInfo.create({ data: companyData });
  }
}

main().then(() => prisma.$disconnect()).catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
