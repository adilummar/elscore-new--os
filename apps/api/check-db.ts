import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const usersWithReadAll = await prisma.userPermission.findMany({
    where: { permission: { code: 'lead.read-all' } },
    include: { user: { include: { userRoles: { include: { role: true } } } } }
  });
  console.log('Users with direct lead.read-all:', usersWithReadAll.map(u => ({
    email: u.user.email,
    roles: u.user.userRoles.map(ur => ur.role.code)
  })));
  
  const rolesWithReadAll = await prisma.rolePermission.findMany({
    where: { permission: { code: 'lead.read-all' } },
    include: { role: true }
  });
  console.log('Roles with lead.read-all:', rolesWithReadAll.map(r => r.role.code));
}

main().catch(console.error).finally(() => prisma.$disconnect());
