import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const role = await prisma.role.findUnique({
    where: { code: 'SALES_COUNSELLOR' },
    include: { permissions: { include: { permission: true } } }
  });
  console.log('SALES_COUNSELLOR permissions:', role?.permissions.map(p => p.permission.code));
}

main().catch(console.error).finally(() => prisma.$disconnect());
