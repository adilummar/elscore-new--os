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

  // Find argon2 location
  console.log('=== Find argon2 ===');
  await sshExec(conn, `find /var/www/elscore-os -name "argon2" -type d 2>/dev/null | head -5`);

  // Use the correct path for argon2
  const resetScript = `
const argon2 = require('/var/www/elscore-os/apps/api/node_modules/argon2');
const { PrismaClient } = require('/var/www/elscore-os/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const hash = await argon2.hash('Password123!');
  const r1 = await prisma.user.updateMany({
    where: { email: 'hr.test@elscoreacademy.com' },
    data: { passwordHash: hash }
  });
  console.log('HR reset count:', r1.count);

  const adminHash = await argon2.hash('ChangeMe123!');
  const r2 = await prisma.user.updateMany({
    where: { email: 'admin@elscore.internal' },
    data: { passwordHash: adminHash }
  });
  console.log('Admin reset count:', r2.count);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
`;

  await sshExec(conn, `cat > /tmp/reset-pwd2.js << 'SCRIPTEOF'\n${resetScript}\nSCRIPTEOF`, { silent: true });
  
  console.log('\n=== Reset passwords ===');
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/reset-pwd2.js 2>&1`);

  // Test HR login
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"hr.test@elscoreacademy.com","password":"Password123!"}' 2>&1`, { silent: true });
  let token = '';
  try {
    const body = JSON.parse(loginResp);
    token = body?.data?.accessToken || '';
    console.log('\nHR Login:', token ? '✅ Token received' : '❌ FAILED: ' + loginResp.slice(0, 200));
  } catch(e) { console.log('Parse error'); }

  if (!token) { conn.end(); return; }

  // Test tutor-hr endpoints
  for (const path of ['/tutor-hr/leads', '/tutor-hr/reviews', '/tutor-hr/settings/mother-tongues', '/tutor-hr/settings/salary-slabs']) {
    const resp = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1${path} -H "Authorization: Bearer ${token}"`, { silent: true });
    console.log(`  ${path}: ${resp.trim()}`);
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
