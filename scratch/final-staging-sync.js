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

  console.log('=== Pull latest main ===');
  await sshExec(conn, `cd /var/www/elscore-os && git pull origin main 2>&1 | tail -3`);

  console.log('\n=== Run seed (new permissions) ===');
  await sshExec(conn, `cd /var/www/elscore-os && pnpm --filter api exec prisma db seed 2>&1 | tail -8`);

  // Reset admin password after seed
  const resetScript = `
const argon2 = require('/var/www/elscore-os/node_modules/.pnpm/argon2@0.41.1/node_modules/argon2');
const { PrismaClient } = require('/var/www/elscore-os/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
async function main() {
  const h = await argon2.hash('ChangeMe123!');
  const r = await prisma.user.updateMany({ where: { email: 'admin@elscore.internal' }, data: { passwordHash: h } });
  console.log('Admin reset:', r.count);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
`;
  await sshExec(conn, `cat > /tmp/rp.js << 'EOS'\n${resetScript}\nEOS`, { silent: true });
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/rp.js 2>&1`);

  // Re-grant permissions on new tables (in case seed recreated anything)
  console.log('\n=== Re-grant permissions ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO elscore_staging; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO elscore_staging;" 2>&1`);

  // Login and verify
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken;
  console.log('\nAdmin login:', token ? '✅' : '❌');

  if (token) {
    const endpoints = [
      '/tutor-hr/leads',
      '/tutor-hr/reviews',
      '/tutor-hr/settings/mother-tongues',
      '/tutor-hr/settings/salary-slabs',
      '/tutor-hr/settings/communication-languages',
    ];
    console.log('\n=== Final endpoint verification ===');
    for (const path of endpoints) {
      const code = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1${path} -H "Authorization: Bearer ${token}"`, { silent: true });
      console.log(`  GET ${path}: ${code.trim()}`);
    }
  }

  console.log('\n\n🎉 Staging fully up to date!');
  console.log('Visit: http://200.234.39.163:3000');
  console.log('Admin: admin@elscore.internal / ChangeMe123!');
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
