const { Client } = require('ssh2');
const { execSync } = require('child_process');

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

  // Reset HR user password using the argon2 node script on the server
  const resetScript = `
const argon2 = require('/var/www/elscore-os/node_modules/argon2');
const { PrismaClient } = require('/var/www/elscore-os/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const hash = await argon2.hash('Password123!');
  await prisma.user.update({
    where: { email: 'hr.test@elscoreacademy.com' },
    data: { passwordHash: hash }
  });
  console.log('HR password reset to: Password123!');

  const adminHash = await argon2.hash('ChangeMe123!');
  await prisma.user.update({
    where: { email: 'admin@elscore.internal' },
    data: { passwordHash: adminHash }
  });
  console.log('Admin password reset to: ChangeMe123!');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
`;

  await sshExec(conn, `cat > /tmp/reset-pwd.js << 'EOF'\n${resetScript}\nEOF`, { silent: true });
  
  console.log('=== Reset passwords ===');
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/reset-pwd.js 2>&1`);

  // Test login with HR user
  console.log('\n=== Test HR login ===');
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"hr.test@elscoreacademy.com","password":"Password123!"}' 2>&1`, { silent: true });
  
  let token = '';
  try {
    const body = JSON.parse(loginResp);
    token = body?.data?.accessToken || '';
    console.log('HR Login:', token ? '✅ OK' : '❌ FAILED');
    if (!token) console.log(loginResp.slice(0, 400));
  } catch(e) {
    console.log('Parse error:', loginResp.slice(0, 300));
    conn.end(); return;
  }

  if (!token) { conn.end(); return; }

  // Test endpoints
  console.log('\n=== GET /tutor-hr/leads ===');
  const leadsResp = await sshExec(conn, `curl -s http://localhost:3001/api/v1/tutor-hr/leads -H "Authorization: Bearer ${token}"`, { silent: true });
  console.log(leadsResp.slice(0, 300));

  console.log('\n=== GET /tutor-hr/reviews ===');
  const reviewsResp = await sshExec(conn, `curl -s http://localhost:3001/api/v1/tutor-hr/reviews -H "Authorization: Bearer ${token}"`, { silent: true });
  console.log(reviewsResp.slice(0, 300));

  console.log('\n=== GET /tutor-hr/settings/mother-tongues ===');
  const mtResp = await sshExec(conn, `curl -s http://localhost:3001/api/v1/tutor-hr/settings/mother-tongues -H "Authorization: Bearer ${token}"`, { silent: true });
  console.log(mtResp.slice(0, 300));

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
