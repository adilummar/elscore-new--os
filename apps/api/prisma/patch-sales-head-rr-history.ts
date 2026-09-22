/**
 * One-shot patch: grants roundrobin.history.read.* permissions to the SALES_HEAD role.
 * Run once against the live DB: npx ts-node apps/api/prisma/patch-sales-head-rr-history.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const role = await prisma.role.findUnique({ where: { code: 'SALES_HEAD' } });
  if (!role) { console.error('SALES_HEAD role not found'); process.exit(1); }

  const codes = [
    'roundrobin.history.read.all',
    'roundrobin.history.read.team',
    'roundrobin.history.read.own',
  ];

  for (const code of codes) {
    const perm = await prisma.permission.findUnique({ where: { code } });
    if (!perm) { console.warn(`Permission ${code} not found — skipping`); continue; }

    const existing = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
    });
    if (existing) { console.log(`  already has ${code}`); continue; }

    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    console.log(`  ✓ granted ${code}`);
  }
  console.log('Done. Restart API or wait for RBAC cache to expire (5 min).');
}

main().catch(console.error).finally(() => prisma.$disconnect());
