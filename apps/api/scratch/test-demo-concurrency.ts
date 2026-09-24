import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DemoService } from '../src/modules/demo/demo.service';
import { PrismaClient } from '@prisma/client';
import { QueueModule } from '../src/common/queue/queue.module';
import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';

const prisma = new PrismaClient();

async function run() {
  console.log('--- Starting Demo Concurrency Test ---');
  


  const lead = await prisma.lead.upsert({
    where: { primaryPhone: '5555555555' },
    update: {},
    create: {
      businessId: 'LED-CONC',
      firstName: 'Conc',
      lastName: 'Lead',
      primaryPhone: '5555555555',
      channel: 'MANUAL',
      status: 'NEW',
    }
  });

  const student = await prisma.student.upsert({
    where: { businessId: 'STU-CONC' },
    update: {},
    create: {
      businessId: 'STU-CONC',
      leadId: lead.id,
      firstName: 'Conc',
      lastName: 'Student',
    }
  });

  const requirement = await prisma.requirement.upsert({
    where: { businessId: 'REQ-CONC' },
    update: {},
    create: {
      businessId: 'REQ-CONC',
      leadId: lead.id,
      studentId: student.id,
      subject: 'MATH',
      grade: 'G_6',
  const requirement = await prisma.requirement.findFirst({
    include: { student: true }
  });
  if (!requirement) throw new Error('No requirement found');

  const student = requirement.student;

  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(QueueModule).useModule(MockQueueModule)
    .overrideProvider(CACHE_MANAGER).useValue({
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
    })
    .compile();
  
  const app = moduleFixture.createNestApplication();
  await app.init();
  const demoService = app.get(DemoService);
  
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const dbUser = await prisma.user.findFirstOrThrow();
  const user: any = { id: dbUser.id, email: dbUser.email, mustChangePassword: false };

  console.log('Simulating 2 concurrent demo bookings...');
  
  const req1 = demoService.bookDemo({
    studentId: student.id,
    requirementId: requirement.id,
    scheduledAt: futureDate,
    durationMinutes: 60,
  }, user);

  const req2 = demoService.bookDemo({
    studentId: student.id,
    requirementId: requirement.id,
    scheduledAt: futureDate,
    durationMinutes: 60,
  }, user);

  const results = await Promise.allSettled([req1, req2]);
  
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
  
  await app.close();
  await prisma.$disconnect();
}

run().catch(console.error);
