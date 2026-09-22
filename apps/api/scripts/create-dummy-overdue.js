const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find a salesperson
  const salesperson = await prisma.user.findFirst({
    where: {
      userRoles: { some: { role: { code: 'SALES_COUNSELLOR' } } }
    },
    include: {
      employee: true
    }
  });

  if (!salesperson) {
    console.log('No salesperson found!');
    return;
  }

  // Find a lead assigned to this salesperson
  let lead = await prisma.lead.findFirst({
    where: { assignedToUserId: salesperson.id, isArchived: false }
  });

  if (!lead) {
    // create a dummy lead if not found
    lead = await prisma.lead.create({
      data: {
        businessId: 'DUMMY-' + Date.now(),
        firstName: 'Test',
        lastName: 'OverdueLead',
        status: 'CONTACTED',
        primaryPhone: '+971555000000',
        source: 'WEBSITE',
        creationChannel: 'INTEGRATION',
        assignedToUserId: salesperson.id,
        createdByUserId: salesperson.id
      }
    });
  }

  // Create an overdue followup
  const followup = await prisma.followUp.create({
    data: {
      businessId: 'FU-' + Date.now(),
      leadId: lead.id,
      createdByUserId: salesperson.id,
      status: 'OVERDUE',
      scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      remarks: 'Customer asked to call back yesterday regarding pricing but was missed.'
    }
  });

  console.log(`Created overdue followup for lead ${lead.firstName} ${lead.lastName}`);
  console.log(`Salesperson: ${salesperson.employee?.firstName || salesperson.email}`);
  console.log(`FollowUp ID: ${followup.id}`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
