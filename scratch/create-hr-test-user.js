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
  // Get HR_MANAGER role
  const hrManagerRole = await prisma.role.findFirst({ where: { code: 'HR_MANAGER' } });
  if (!hrManagerRole) { console.log('HR_MANAGER role not found'); process.exit(1); }
  console.log('HR_MANAGER role id:', hrManagerRole.id);

  // Get a department
  const dept = await prisma.department.findFirst();
  if (!dept) { console.log('No department found'); process.exit(1); }
  console.log('Department id:', dept.id, dept.name);

  const hash = await argon2.hash('Password123!');

  // Create or update user
  const user = await prisma.user.upsert({
    where: { email: 'hr.test@elscoreacademy.com' },
    update: { passwordHash: hash, isActive: true },
    create: {
      email: 'hr.test@elscoreacademy.com',
      passwordHash: hash,
      isActive: true,
    },
  });
  console.log('User created/updated:', user.id, user.email);

  // Check if employee already exists for this user
  const existingEmp = await prisma.employee.findUnique({ where: { userId: user.id } });
  if (existingEmp) {
    console.log('Employee already exists:', existingEmp.id);
  } else {
    // Create employee
    const emp = await prisma.employee.create({
      data: {
        businessId: 'EMP-HR-TEST-001',
        userId: user.id,
        departmentId: dept.id,
        firstName: 'HR',
        lastName: 'Test',
        phone: '+971000000001',
        employmentStatus: 'ACTIVE',
        roleId: hrManagerRole.id,
      }
    });
    console.log('Employee created:', emp.id, emp.businessId);
  }

  await prisma.$disconnect();
  console.log('\\n✅ hr.test@elscoreacademy.com ready with password: Password123!');
}
main().catch(e => { console.error(e.message); process.exit(1); });
`;

  await sshExec(conn, `cat > /tmp/create-hr-user.js << 'EOJS'\n${script}\nEOJS`, { silent: true });
  console.log('=== Creating HR test user ===');
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/create-hr-user.js 2>&1`);

  // Test login
  console.log('\n=== Test login ===');
  const resp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"hr.test@elscoreacademy.com","password":"Password123!"}' 2>&1`, { silent: true });
  let token = '';
  try { token = JSON.parse(resp)?.data?.accessToken || ''; } catch(e) {}
  console.log('Login:', token ? '✅ Success!' : '❌ Failed: ' + resp.slice(0, 200));

  if (token) {
    // Test tutor-hr access
    const code = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/tutor-hr/leads -H "Authorization: Bearer ${token}"`, { silent: true });
    console.log('Tutor HR leads access:', code.trim());
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
