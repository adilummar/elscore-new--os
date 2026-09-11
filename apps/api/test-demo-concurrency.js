const { PrismaClient } = require('@prisma/client');


const prisma = new PrismaClient();

async function run() {
  console.log('--- Starting Demo Concurrency Test ---');
  
  const user = await prisma.user.findFirstOrThrow();
  const subject = await prisma.subject.findFirstOrThrow();
  const grade = await prisma.grade.findFirstOrThrow();
  const curriculum = await prisma.curriculum.findFirstOrThrow();

  const lead = await prisma.lead.upsert({
    where: { businessId: 'LED-CONC2' },
    update: {},
    create: {
      businessId: 'LED-CONC2',
      firstName: 'Conc',
      lastName: 'Lead',
      primaryPhone: '9998887776',
      creationChannel: 'SALES_COUNSELLOR',
      source: 'DIRECT',
      status: 'NEW',
      createdByUserId: user.id,
    }
  });

  const student = await prisma.student.upsert({
    where: { businessId: 'STU-CONC2' },
    update: {},
    create: {
      businessId: 'STU-CONC2',
      leadId: lead.id,
      firstName: 'Conc',
      lastName: 'Student',
    }
  });

  const requirement = await prisma.requirement.upsert({
    where: { businessId: 'REQ-CONC2' },
    update: {},
    create: {
      businessId: 'REQ-CONC2',
      student: { connect: { id: student.id } },
      subject: { connect: { id: subject.id } },
      grade: { connect: { id: grade.id } },
      curriculum: { connect: { id: curriculum.id } },
    }
  });

  // Since we can't easily boot NestJS in JS without TS decorators,
  // we will test Postgres transaction isolation using Prisma directly!

  console.log('Simulating 2 concurrent demo bookings using raw Prisma transaction...');

  const futureDate = new Date(Date.now() + 86400000);

  // The logic in checkOverlap and demo creation
  const bookDemoTx = async () => {
    return prisma.$transaction(async (tx) => {
      // Row-level lock (critical for concurrency)
      await tx.$queryRaw`SELECT 1 FROM "Student" WHERE "id" = ${student.id} FOR UPDATE`;

      // check overlap
      const overlap = await tx.demo.findFirst({
        where: {
          studentId: student.id,
          status: { in: ['SCHEDULED', 'ASSIGNED'] }
        }
      });
      if (overlap) throw new Error('Student already has an active demo booked.');

      // create demo
      return tx.demo.create({
        data: {
          businessId: 'DMO-' + Math.random().toString(36).substr(2, 5),
          studentId: student.id,
          requirementId: requirement.id,
          scheduledAt: futureDate,
          durationMinutes: 60,
          status: 'SCHEDULED',
          createdById: 'some-user',
        }
      });
    });
  };

  const results = await Promise.allSettled([bookDemoTx(), bookDemoTx()]);

  console.log('Results:');
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`Request ${i+1}: Success (Demo ${r.value.businessId})`);
    else console.log(`Request ${i+1}: Failed with error: ${r.reason.message}`);
  });

  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failCount = results.filter(r => r.status === 'rejected').length;

  if (successCount === 1 && failCount === 1) {
    console.log('SUCCESS! Concurrency handled correctly.');
  } else {
    console.log('FAILED! Unexpected results.');
  }

  // Cleanup
  await prisma.demo.deleteMany({ where: { requirementId: requirement.id } });
  await prisma.requirement.delete({ where: { id: requirement.id } });
  await prisma.student.delete({ where: { id: student.id } });
  await prisma.lead.delete({ where: { id: lead.id } });

  await prisma.$disconnect();
}

run().catch(console.error);
