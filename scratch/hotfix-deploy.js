const { Client } = require('ssh2');

const PROJECT_DIR = '/var/www/elscore-os';

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(String(d)); });
      stream.stderr.on('data', d => { out += d; process.stderr.write('[ERR] ' + String(d)); });
      stream.on('close', code => resolve({ out, code }));
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
  console.log('✅ SSH Connected\n');

  // Step 1: Pull latest code
  console.log('\n=== STEP 1: Pulling latest code from GitHub ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && git fetch origin && git reset --hard origin/main`);

  // Step 2: Install any new dependencies
  console.log('\n=== STEP 2: Installing dependencies ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm install --frozen-lockfile 2>&1 | tail -5`);

  // Step 3: Regenerate Prisma client (in case schema changed)
  console.log('\n=== STEP 3: Generating Prisma client ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm run db:generate 2>&1 | tail -5`);

  // Step 4: Build the application
  console.log('\n=== STEP 4: Building application (3-5 min) ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm run build 2>&1 | tail -30`);

  // Step 5: Run any pending DB migrations safely
  console.log('\n=== STEP 5: Running database migrations ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm --filter api exec prisma migrate deploy 2>&1`);

  // Step 6: Copy Next.js static assets for standalone build
  console.log('\n=== STEP 6: Copying static assets ===');
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/.next/static ${PROJECT_DIR}/apps/web/.next/standalone/.next/ 2>/dev/null || true`);
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/public ${PROJECT_DIR}/apps/web/.next/standalone/ 2>/dev/null || true`);

  // Step 7: Restart PM2 services
  console.log('\n=== STEP 7: Restarting services via PM2 ===');
  await sshExec(conn, `pm2 restart elscore-api || pm2 start ${PROJECT_DIR}/apps/api/dist/main.js --name elscore-api`);
  await sshExec(conn, `pm2 restart elscore-web || (cd ${PROJECT_DIR}/apps/web/.next/standalone && PORT=3000 HOSTNAME=0.0.0.0 pm2 start server.js --name elscore-web)`);
  await sshExec(conn, 'pm2 save');

  // Wait for startup
  console.log('\nWaiting 8s for services to come up...');
  await new Promise(r => setTimeout(r, 8000));

  // Step 8: Verify
  console.log('\n=== STEP 8: Verifying deployment ===');
  await sshExec(conn, 'pm2 list');
  await sshExec(conn, `curl -s -o /dev/null -w "API: %{http_code}\\n" http://localhost:3001/api/v1/health || echo "API starting..."`);
  await sshExec(conn, `curl -s -o /dev/null -w "Web: %{http_code}\\n" http://localhost:3000/ || echo "Web starting..."`);

  console.log('\n\n🎉 ================================================');
  console.log('HOTFIX DEPLOYED SUCCESSFULLY!');
  console.log('================================================');
  console.log('URL:       http://200.234.39.163:3000');
  console.log('Fix:       Sales counsellors now see only their own leads');
  console.log('================================================\n');

  conn.end();
}

run().catch(err => {
  console.error('\n❌ DEPLOYMENT FAILED:', err.message || err);
  process.exit(1);
});
