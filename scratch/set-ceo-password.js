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

  // Reset admin/CEO password to a known value and test login
  const script = `
const argon2 = require('/var/www/elscore-os/node_modules/.pnpm/argon2@0.41.1/node_modules/argon2');
const { PrismaClient } = require('/var/www/elscore-os/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
async function main() {
  const hash = await argon2.hash('ElscoreCEO!2026');
  const r = await prisma.user.updateMany({
    where: { email: 'admin@elscore.internal' },
    data: { passwordHash: hash, status: 'ACTIVE' }
  });
  console.log('Updated:', r.count, 'user(s)');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
`;

  await sshExec(conn, `cat > /tmp/set-ceo-pwd.js << 'EOS'\n${script}\nEOS`, { silent: true });
  console.log('=== Set CEO password ===');
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/set-ceo-pwd.js 2>&1`);

  // Test login
  const resp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ElscoreCEO!2026"}' 2>&1`, { silent: true });
  let body;
  try { body = JSON.parse(resp); } catch(e) { body = {}; }
  const token = body?.data?.accessToken || '';
  console.log('\nLogin test:', token ? '✅ SUCCESS' : '❌ FAILED: ' + resp.slice(0, 200));

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
