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

  // Find argon2 in pnpm store
  const argon2Path = '/var/www/elscore-os/node_modules/.pnpm/argon2@0.41.1/node_modules/argon2';
  const prismaPath = '/var/www/elscore-os/apps/api/node_modules/@prisma/client';
  
  const script = `
const argon2 = require('${argon2Path}');
const { PrismaClient } = require('${prismaPath}');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const hash = await argon2.hash('Password123!');
  
  // Reset an existing HR manager user
  const hrEmail = 'hrmanager_test1789472020157@elscore.test';
  const r = await prisma.user.updateMany({ where: { email: hrEmail }, data: { passwordHash: hash } });
  console.log('HR reset count:', r.count, '=> Email:', hrEmail, '=> Password: Password123!');
  
  // Also reset admin
  const adminHash = await argon2.hash('ChangeMe123!');
  const r2 = await prisma.user.updateMany({ where: { email: 'admin@elscore.internal' }, data: { passwordHash: adminHash } });
  console.log('Admin reset count:', r2.count);
  
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
`;

  await sshExec(conn, `cat > /tmp/resetpwd3.js << 'EOFILE'\n${script}\nEOFILE`, { silent: true });
  
  console.log('=== Reset passwords ===');
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/resetpwd3.js 2>&1`);

  // Test logins
  const targets = [
    { email: 'hrmanager_test1789472020157@elscore.test', password: 'Password123!' },
    { email: 'admin@elscore.internal', password: 'ChangeMe123!' },
  ];
  
  for (const t of targets) {
    const resp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"${t.email}","password":"${t.password}"}' 2>&1`, { silent: true });
    let token = '';
    try { token = JSON.parse(resp)?.data?.accessToken || ''; } catch(e) {}
    console.log(`Login ${t.email}: ${token ? '✅ OK' : '❌ FAIL'}`);
    
    if (token) {
      for (const path of ['/tutor-hr/leads', '/tutor-hr/reviews']) {
        const code = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1${path} -H "Authorization: Bearer ${token}"`, { silent: true });
        console.log(`  ${path}: ${code.trim()}`);
      }
    }
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
