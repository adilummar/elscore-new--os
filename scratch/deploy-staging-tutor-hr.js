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
  console.log('✅ Connected to staging\n');
  const STAGING = '/var/www/elscore-os';

  console.log('=== STEP 1: Pull latest main ===');
  await sshExec(conn, `cd ${STAGING} && git fetch origin && git checkout main && git reset --hard origin/main`);

  console.log('\n=== STEP 2: Install deps ===');
  await sshExec(conn, `cd ${STAGING} && pnpm install --frozen-lockfile 2>&1 | tail -3`);

  console.log('\n=== STEP 3: Prisma generate ===');
  await sshExec(conn, `cd ${STAGING} && pnpm --filter api exec prisma generate 2>&1 | tail -3`);

  console.log('\n=== STEP 4: Run migration (adds new TutorLead columns) ===');
  await sshExec(conn, `cd ${STAGING} && DATABASE_URL=$(grep DATABASE_URL apps/api/.env | cut -d= -f2-) pnpm --filter api exec prisma migrate deploy 2>&1`);

  console.log('\n=== STEP 5: Build API ===');
  await sshExec(conn, `cd ${STAGING} && pnpm --filter api run build 2>&1 | tail -5`);

  console.log('\n=== STEP 6: Build Web ===');
  await sshExec(conn, `cd ${STAGING} && pnpm --filter web run build 2>&1 | tail -10`);

  console.log('\n=== STEP 7: Sync standalone with fresh build ===');
  // Copy static client chunks (browser-side JS)
  await sshExec(conn, `mkdir -p ${STAGING}/apps/web/.next/standalone/apps/web/.next && cp -rf ${STAGING}/apps/web/.next/static ${STAGING}/apps/web/.next/standalone/apps/web/.next/ 2>/dev/null; echo "static done"`);
  // Copy server chunks (server actions, RSC, etc.)
  await sshExec(conn, `cp -rf ${STAGING}/apps/web/.next/server ${STAGING}/apps/web/.next/standalone/apps/web/.next/ 2>/dev/null; echo "server done"`);
  // Copy public assets
  await sshExec(conn, `cp -rf ${STAGING}/apps/web/public ${STAGING}/apps/web/.next/standalone/apps/web/ 2>/dev/null; echo "public done"`);
  // Copy BUILD_ID and required files
  await sshExec(conn, `cp -f ${STAGING}/apps/web/.next/BUILD_ID ${STAGING}/apps/web/.next/standalone/apps/web/.next/ 2>/dev/null; cp -f ${STAGING}/apps/web/.next/required-server-files.json ${STAGING}/apps/web/.next/standalone/apps/web/.next/ 2>/dev/null; echo "meta done"`);


  console.log('\n=== STEP 8: Restart staging ===');
  await sshExec(conn, `cd /var/www/elscore-os && pm2 restart ecosystem.config.js --only elscore-api --update-env; pm2 restart ecosystem.config.js --only elscore-web --update-env; pm2 save`);

  console.log('\nWaiting 8s for services...');
  await new Promise(r => setTimeout(r, 8000));

  console.log('\n=== STEP 9: Health check ===');
  await sshExec(conn, 'pm2 list');
  await sshExec(conn, 'curl -s -o /dev/null -w "Staging API (3001): %{http_code}\\n" http://localhost:3001/api/v1/health');
  await sshExec(conn, 'curl -s -o /dev/null -w "Staging Web (3000): %{http_code}\\n" http://localhost:3000/');

  console.log('\n🎉 Staging deployment complete!');
  console.log('URL: http://200.234.39.163:3000');
  conn.end();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
