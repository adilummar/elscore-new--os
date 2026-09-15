const { Client } = require('ssh2');

const PROJECT_DIR = '/var/www/elscore-os';
const STAGING_API_PORT = 3001;
const STAGING_WEB_PORT = 3000;

function sshExec(conn, cmd, label = 'SERVER') {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(`[${label}] ${d}`); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(`[${label} ERR] ${d}`); });
      stream.on('close', code => resolve({ out, code }));
    });
  });
}

function sshWrite(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', resolve);
      ws.on('error', reject);
      ws.write(content);
      ws.end();
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

  // Pull latest code with fixes
  console.log('=== Pulling latest code (with TypeScript fixes) ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && git pull origin main`, 'GIT');

  // Build API
  console.log('\n=== Building API (NestJS) ===');
  const apiBuild = await sshExec(conn, `cd ${PROJECT_DIR} && pnpm --filter api run build 2>&1 | tail -20`, 'API-BUILD');
  if (apiBuild.out.includes('error TS') || apiBuild.out.includes('ELIFECYCLE')) {
    console.error('❌ API build failed! Check errors above.');
  } else {
    console.log('✅ API build succeeded');
  }

  // Build Web  
  console.log('\n=== Building Web (Next.js) ===');
  const webBuild = await sshExec(conn, `cd ${PROJECT_DIR} && pnpm --filter web run build 2>&1 | tail -25`, 'WEB-BUILD');
  if (webBuild.out.includes('Build error') || webBuild.out.includes('ELIFECYCLE')) {
    console.error('❌ Web build failed!');
  } else {
    console.log('✅ Web build succeeded');
  }

  // Copy Next.js static files into standalone output
  console.log('\n=== Copying Next.js static assets ===');
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/.next/static ${PROJECT_DIR}/apps/web/.next/standalone/.next/ 2>/dev/null && echo OK || echo WARN: static copy failed`, 'STATIC');
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/public ${PROJECT_DIR}/apps/web/.next/standalone/ 2>/dev/null || true`, 'STATIC');

  // Run seed (DB already migrated, only seeds if no users exist)
  console.log('\n=== Running seed (idempotent) ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm run db:seed 2>&1 | tail -10`, 'SEED');

  // Restart PM2 services
  console.log('\n=== Restarting PM2 services ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pm2 delete elscore-api 2>/dev/null; pm2 delete elscore-web 2>/dev/null; pm2 start ecosystem.config.js && pm2 save`, 'PM2');

  // Wait for startup
  console.log('\nWaiting 10s for services to start up...');
  await new Promise(r => setTimeout(r, 10000));

  // Verification
  console.log('\n=== Final Verification ===');
  await sshExec(conn, 'pm2 list', 'PM2');
  await sshExec(conn, `curl -s -o /dev/null -w "API HTTP Status: %{http_code}\\n" http://localhost:${STAGING_API_PORT}/api/v1/auth/me`, 'VERIFY');
  await sshExec(conn, `curl -s -o /dev/null -w "Web HTTP Status: %{http_code}\\n" http://localhost:${STAGING_WEB_PORT}/`, 'VERIFY');
  await sshExec(conn, `ls -la ${PROJECT_DIR}/apps/web/.next/standalone/server.js 2>/dev/null && echo "✅ standalone/server.js EXISTS" || echo "❌ standalone/server.js NOT FOUND"`, 'CHECK');

  console.log('\n🎉 ================================================');
  console.log('REDEPLOY COMPLETE!');
  console.log('================================================');
  console.log(`Frontend:  http://200.234.39.163:${STAGING_WEB_PORT}`);
  console.log(`API:       http://200.234.39.163:${STAGING_API_PORT}/api/v1`);
  console.log(`Swagger:   http://200.234.39.163:${STAGING_API_PORT}/docs`);
  console.log('Admin:     admin@elscore.internal / ChangeMe123!');
  console.log('================================================\n');

  conn.end();
}

run().catch(err => {
  console.error('\n❌ REDEPLOY FAILED:', err.message || err);
  process.exit(1);
});
