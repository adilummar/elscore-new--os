const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function patch() {
  const users = await prisma.user.findMany({
    where: {
      userRoles: {
        some: {
          role: {
            code: {
              in: ['SALES_HEAD', 'SALES_COUNSELLOR']
            }
          }
        }
      },
      RoundRobinCounsellorState: { none: {} }
    }
  });
  console.log('Users missing RR state:', users.length);
  for (const u of users) {
    await prisma.roundRobinCounsellorState.create({
      data: {
        userId: u.id,
        isEligible: true,
        dailyState: 'ACTIVE'
      }
    });
    console.log('Added RR state for user', u.id);
  }
}
patch().catch(console.error).finally(() => prisma.$disconnect());
