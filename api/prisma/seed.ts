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
    bcrypt.hash('Admin@123456', 12),
    bcrypt.hash('Staff@123456', 12),
  ]);

  await Promise.all([
    prisma.userAccount.upsert({
      where: { username: 'admin' },
      update: { displayName: '系统管理员', passwordHash: adminHash, roleId: adminRole.id },
      create: { username: 'admin', displayName: '系统管理员', passwordHash: adminHash, roleId: adminRole.id },
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
    prisma.sampleLocation.upsert({
      where: { code: 'A-01' }, update: { name: '样品库 A-01' }, create: { code: 'A-01', name: '样品库 A-01' },
    }),
    prisma.materialFabric.upsert({
      where: { itemNo: 'MQ-0001' },
      update: { name: '全棉针织面料', categoryId: category.id, providerId: provider.id },
      create: { itemNo: 'MQ-0001', name: '全棉针织面料', specification: '100% Cotton', color: '本白', cost: '25.00', categoryId: category.id, providerId: provider.id },
    }),
  ]);
}

main().then(() => prisma.$disconnect()).catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
