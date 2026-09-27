const { Client } = require('ssh2');

function sshExec(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; if (!opts.silent) process.stdout.write(String(d)); });
      stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
      stream.on('close', () => resolve(out));
    });
  });
}

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  console.log('Connected\n');

  const script = `
const argon2 = require('/var/www/elscore-os/node_modules/.pnpm/argon2@0.41.1/node_modules/argon2');
const { PrismaClient } = require('/var/www/elscore-os/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const hrRole = await prisma.role.findFirst({ where: { code: 'HR_MANAGER' } });
  const dept = await prisma.department.findFirst();
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@elscore.internal' } });
  
  if (!hrRole || !dept || !adminUser) {
    console.log('Missing data:', { hrRole: !!hrRole, dept: !!dept, adminUser: !!adminUser });
    process.exit(1);
  }

  const hash = await argon2.hash('Password123!');

  // Create user with ACTIVE status
  const user = await prisma.user.upsert({
    where: { email: 'hr.test@elscoreacademy.com' },
    update: { passwordHash: hash, status: 'ACTIVE' },
    create: {
      email: 'hr.test@elscoreacademy.com',
      passwordHash: hash,
      status: 'ACTIVE',
      mustChangePassword: false,
    },
  });
  console.log('User:', user.id, user.email, user.status);

  // Create employee record if not exists
  let emp = await prisma.employee.findUnique({ where: { userId: user.id } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        businessId: 'EMP-HR-TEST-001',
        userId: user.id,
        departmentId: dept.id,
        firstName: 'HR',
        lastName: 'Test',
        employmentStatus: 'ACTIVE',
      },
    });
    console.log('Employee created:', emp.id, emp.businessId);
  } else {
    console.log('Employee exists:', emp.id);
  }

  // Assign HR_MANAGER role via UserRole
  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: hrRole.id },
  });
  if (!existingRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: hrRole.id,
        grantedByUserId: adminUser.id,
        isActive: true,
      },
    });
    console.log('HR_MANAGER role assigned');
  } else {
    console.log('Role already assigned');
  }

  console.log('\\n✅ Done! Login: hr.test@elscoreacademy.com / Password123!');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
`;

  await sshExec(conn, `cat > /tmp/create-hr2.js << 'EOJS'\n${script}\nEOJS`, { silent: true });
  console.log('=== Creating HR user ===');
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/create-hr2.js 2>&1`);

  // Test login
  const resp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"hr.test@elscoreacademy.com","password":"Password123!"}' 2>&1`, { silent: true });
  let token = '';
  try { token = JSON.parse(resp)?.data?.accessToken || ''; } catch(e) {}
  console.log('\nLogin test:', token ? '✅ Success!' : '❌ ' + resp.slice(0, 200));

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
