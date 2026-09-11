const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const admin = await prisma.user.findFirst();
  await prisma.$executeRawINSERT INTO leads (id, business_id, first_name, last_name, primary_phone, source, status, created_by_user_id, creation_channel, updated_at) VALUES ('d49b7490-03c4-4a10-a6e1-e3f383dbdba1', 'L-001', 'Test', 'Concur', '555123', 'WEBSITE', 'NEW', '', 'MANUAL', NOW()) ON CONFLICT DO NOTHING;;
  let lead = await prisma.lead.findFirst();
  console.log('Testing concurrency on Lead:', lead.id);
  const fup1 = prisma.followUp.create({ data: { businessId: 'FUP-C1', leadId: lead.id, createdByUserId: admin.id, scheduledAt: new Date(Date.now() + 86400000), status: 'SCHEDULED' } });
  const fup2 = prisma.followUp.create({ data: { businessId: 'FUP-C2', leadId: lead.id, createdByUserId: admin.id, scheduledAt: new Date(Date.now() + 86400000), status: 'SCHEDULED' } });
  try { await Promise.all([fup1, fup2]); console.log('FAIL: Both succeeded!'); } catch (err) { console.log('PASS: Concurrency caught!', err.message.substring(0, 200)); }
  const activeCount = await prisma.followUp.count({ where: { leadId: lead.id, status: 'SCHEDULED' } });
  console.log('Active scheduled count:', activeCount);
}
run().finally(() => prisma.$disconnect());
