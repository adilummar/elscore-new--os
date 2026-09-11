import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  const lead1 = await prisma.lead.create({
    data: {
      businessId: 'LED-TEST-001',
      primaryPhone: '0000000001',
      source: 'DIRECT',
      creationChannel: 'SALES_COUNSELLOR',
      createdByUserId: 'SYSTEM',
    }
  });

  const lead2 = await prisma.lead.create({
    data: {
      businessId: 'LED-TEST-002',
      primaryPhone: '0000000002',
      source: 'WEBSITE',
      creationChannel: 'SALES_COUNSELLOR',
      createdByUserId: 'SYSTEM',
      requiresFollowUp: true,
    }
  });

  console.log('Lead 1 requiresFollowUp (default):', lead1.requiresFollowUp);
  console.log('Lead 2 requiresFollowUp (explicit):', lead2.requiresFollowUp);

  await prisma.lead.deleteMany({
    where: { businessId: { in: ['LED-TEST-001', 'LED-TEST-002'] } }
  });
  
  await prisma.$disconnect();
}

main().catch(console.error);
