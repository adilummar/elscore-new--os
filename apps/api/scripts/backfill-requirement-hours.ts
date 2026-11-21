/**
 * One-time repair: fills a student's missing monthly hours on the requirement from the latest generated quotation.
 *
 * Why: a Mentor's capacity is the sum of the monthly hours on each student's requirements. A student whose requirement has no hours
 * counts as 0 h, even when the quotation the parent accepted lists the hours. This copies those hours across, and only there.
 *
 * Safe by design:
 *  - Dry run unless --execute is passed. A dry run changes nothing.
 *  - Only a requirement whose hours are missing or zero is touched. A recorded value is never changed.
 *  - Only students with a live (not cancelled) Mentoring activation are considered.
 *  - Only the latest GENERATED quotation of the student is used, and only a line item for the same subject with hours above zero.
 *  - Everything it would change, or did change, is printed, one line per requirement.
 *
 *   npm run backfill:requirement-hours                (dry run)
 *   npm run backfill:requirement-hours -- --execute   (writes)
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const execute = process.argv.slice(2).includes('--execute');
  console.log(`Mode: ${execute ? 'EXECUTE (writes)' : 'DRY RUN (no changes)'}`);
  const prisma = new PrismaClient();
  try {
    const activations = await prisma.mentoringActivation.findMany({ where: { status: { not: 'CANCELLED' } }, select: { studentId: true } });
    const studentIds = Array.from(new Set(activations.map((a) => a.studentId)));
    const plan: Array<{ requirementId: string; student: string; subject: string; hours: number; quotation: string }> = [];

    for (const studentId of studentIds) {
      const quotation = await prisma.quotation.findFirst({ where: { studentId, status: 'GENERATED' }, orderBy: { createdAt: 'desc' }, include: { lineItems: true } });
      if (!quotation) continue;
      const requirements = await prisma.requirement.findMany({ where: { studentId }, include: { student: { select: { businessId: true } }, subject: { select: { name: true } } } });
      for (const r of requirements) {
        if (r.monthlyHours !== null && Number(r.monthlyHours) > 0) continue;
        const line = quotation.lineItems.find((l) => l.subjectId === r.subjectId && Number(l.monthlyHours) > 0);
        if (!line) continue;
        plan.push({ requirementId: r.id, student: r.student.businessId ?? studentId, subject: r.subject.name, hours: Number(line.monthlyHours), quotation: quotation.quotationNumber });
      }
    }

    for (const p of plan) console.log(`${execute ? 'SET ' : 'WOULD SET '} ${p.student} ${p.subject}: ${p.hours} h a month, from quotation ${p.quotation}`);
    console.log(`${plan.length} requirement(s) ${execute ? 'updated' : 'would be updated'} across ${new Set(plan.map((p) => p.student)).size} student(s). ${studentIds.length} live student(s) checked.`);

    if (execute && plan.length > 0) {
      await prisma.$transaction(plan.map((p) => prisma.requirement.update({ where: { id: p.requirementId }, data: { monthlyHours: p.hours } })));
      console.log('Done.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
