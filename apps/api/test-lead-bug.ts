import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://127.0.0.1:3001/api/v1';

async function main() {
  const scA = await prisma.user.findFirst({
    where: { email: 'uat_sca@test.com' },
    include: { userRoles: { include: { role: true } } }
  });
  console.log('Sales Counsellor A Roles:', scA?.userRoles.map(ur => ur.role.code));

  // Get token
  let token = '';
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'uat_sca@test.com',
        password: 'password123'
      })
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(data.message || 'Login failed');
    token = data.data.accessToken;
  } catch (e: any) {
    console.error('Login failed:', e.message);
    return;
  }

  // Get leads
  try {
    const res = await fetch(`${API_URL}/leads`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(data.message || 'Get leads failed');
    
    console.log('Total leads seen by SC A:', data.data.length);
    const otherLeads = data.data.filter((l: any) => l.assignedToUser?.id !== scA?.id);
    console.log('Leads NOT belonging to SC A:', otherLeads.length);
    if (otherLeads.length > 0) {
      console.log('Sample leak:', otherLeads[0].assignedToUser);
    }
  } catch (e: any) {
    console.error('Get leads failed:', e.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
