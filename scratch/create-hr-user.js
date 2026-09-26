const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Password123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const adminDept = await prisma.department.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const hrRole = await prisma.role.findUniqueOrThrow({ where: { code: 'HR_MANAGER' } });

  const testUser = await prisma.user.upsert({
    where: { email: 'hr.test@elscoreacademy.com' },
    update: { passwordHash },
    create: {
      email: 'hr.test@elscoreacademy.com',
      passwordHash,
      status: 'ACTIVE',
      userRoles: {
        create: {
          roleId: hrRole.id,
        },
      },
      employee: {
        create: {
          businessId: 'HR-TEST-001',
          departmentId: adminDept.id,
          employmentStatus: 'ACTIVE',
          firstName: 'HR',
          lastName: 'Test',
        }
      }
    },
  });

  console.log('Created/Updated HR Test User: hr.test@elscoreacademy.com / Password123!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
