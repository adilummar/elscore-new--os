const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConcurrency() {
  let lead = await prisma.lead.findFirst({ include: { followUps: true } });
  if (!lead) {
      const admin = await prisma.user.findFirst();
      lead = await prisma.lead.create({ data: { businessId: 'LD-TEST', source: 'WEBSITE', status: 'NEW', firstName: 'Concur', lastName: 'Test', primaryPhone: '555000000', createdByUserId: admin.id, creationChannel: 'MANUAL' } });
  }
  await prisma.followUp.deleteMany({ where: { leadId: lead.id } });

  console.log('Testing concurrency on Lead:', lead.id);

  const actorUserId = lead.assignedToUserId || lead.createdByUserId;

  const fup1 = prisma.followUp.create({
    data: {
      businessId: 'FUP-C1',
      leadId: lead.id,
      createdByUserId: actorUserId,
      scheduledAt: new Date(Date.now() + 86400000),
      status: 'SCHEDULED'
    }
  });

  const fup2 = prisma.followUp.create({
    data: {
      businessId: 'FUP-C2',
      leadId: lead.id,
      createdByUserId: actorUserId,
      scheduledAt: new Date(Date.now() + 86400000),
      status: 'SCHEDULED'
    }
  });

  try {
    await Promise.all([fup1, fup2]);
    console.log('FAIL: Both succeeded!');
  } catch (err) {
    console.log('PASS: Concurrency caught!', err.message.substring(0, 200));
  }

  const activeCount = await prisma.followUp.count({ where: { leadId: lead.id, status: 'SCHEDULED' } });
  console.log('Active scheduled count:', activeCount);
}

testConcurrency().finally(() => prisma.$disconnect());
