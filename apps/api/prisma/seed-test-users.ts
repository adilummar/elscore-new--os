import { PrismaClient, UserStatus, EmploymentStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedTestUsers() {
  console.log('🌱 Seeding UAT test users...');

  const password = 'Test@1234!';
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const testUsers = [
    {
      email: 'uat_sca@elscore.test',
      firstName: 'UAT',
      lastName: 'Sales A',
      roleCode: 'SALES_COUNSELLOR',
      deptCode: 'SALES',
    },
    {
      email: 'uat_scb@elscore.test',
      firstName: 'UAT',
      lastName: 'Sales B',
      roleCode: 'SALES_COUNSELLOR',
      deptCode: 'SALES',
    },
    {
      email: 'uat_sh@elscore.test',
      firstName: 'UAT',
      lastName: 'Sales Head',
      roleCode: 'SALES_HEAD',
      deptCode: 'SALES',
    },
    {
      email: 'counsellor-finance-conc@elscore.internal',
      firstName: 'Fin',
      lastName: 'Counsellor',
      roleCode: 'FINANCE_EXECUTIVE',
      deptCode: 'FINANCE',
    },
  ];

  for (const t of testUsers) {
    const exists = await prisma.user.findUnique({ where: { email: t.email } });
    if (exists) {
      console.log(`    User ${t.email} already exists — skipping.`);
      continue;
    }

    const dept = await prisma.department.findUnique({ where: { code: t.deptCode } });
    const role = await prisma.role.findUnique({ where: { code: t.roleCode } });

    if (!dept || !role) {
      console.log(`    ⚠️ Skipping ${t.email} - Dept or Role not found in DB`);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        email: t.email,
        passwordHash,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        userRoles: {
          create: { roleId: role.id },
        },
      },
    });

    const seq = await prisma.sequence.update({
      where: { entityType: 'EMP' },
      data: { nextNumber: { increment: 1 } },
    });
    const businessId = `EMP-${String(seq.nextNumber - 1).padStart(4, '0')}`;

    await prisma.employee.create({
      data: {
        businessId,
        userId: user.id,
        departmentId: dept.id,
        employmentStatus: EmploymentStatus.ACTIVE,
        firstName: t.firstName,
        lastName: t.lastName,
      },
    });

    console.log(`    ✅ Created ${t.email} (${t.roleCode}) — Employee ID: ${businessId}`);
  }

  console.log('✅ UAT test users seeded successfully.');
}

seedTestUsers()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
