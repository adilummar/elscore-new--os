const { Client } = require('ssh2');

const GITHUB_REPO = 'https://github.com/adilummar/elscore-new--os.git';
const PROJECT_DIR = '/var/www/elscore-os';
const STAGING_API_PORT = 3001;
const STAGING_WEB_PORT = 3000;

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

  // ── Step 1: Install system packages ─────────────────────────────────────────
  console.log('=== STEP 1: Installing system packages ===');
  const installScript = `#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postgresql redis-server curl git build-essential
systemctl enable postgresql redis-server
systemctl start postgresql redis-server
echo "STEP1_OK"
`;
  await sshWrite(conn, '/tmp/step1.sh', installScript);
  await sshExec(conn, 'bash /tmp/step1.sh');

  // ── Step 2: Create DB ────────────────────────────────────────────────────────
  console.log('\n=== STEP 2: Creating staging database ===');
  const dbScript = `#!/bin/bash
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='elscore_staging'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER elscore_staging WITH PASSWORD 'StagingDb2024';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='elscore_os_staging'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE elscore_os_staging OWNER elscore_staging;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE elscore_os_staging TO elscore_staging;"
echo "STEP2_OK"
`;
  await sshWrite(conn, '/tmp/step2.sh', dbScript);
  await sshExec(conn, 'bash /tmp/step2.sh');

  // ── Step 3: Install pnpm ─────────────────────────────────────────────────────
  console.log('\n=== STEP 3: Installing pnpm ===');
  await sshExec(conn, 'command -v pnpm || npm install -g pnpm@9');
  await sshExec(conn, 'pnpm -v');

  // ── Step 4: Clone/update repo ────────────────────────────────────────────────
  console.log('\n=== STEP 4: Cloning repository ===');
  const cloneScript = `#!/bin/bash
if [ -d "${PROJECT_DIR}/.git" ]; then
  cd ${PROJECT_DIR}
  git fetch origin
  git reset --hard origin/main
  git pull origin main
else
  git clone ${GITHUB_REPO} ${PROJECT_DIR}
fi
cd ${PROJECT_DIR}
git log --oneline -1
echo "STEP4_OK"
`;
  await sshWrite(conn, '/tmp/step4.sh', cloneScript);
  await sshExec(conn, 'bash /tmp/step4.sh');

  // ── Step 5: Generate secrets ─────────────────────────────────────────────────
  console.log('\n=== STEP 5: Generating JWT secrets ===');
  const secretRes = await sshExec(conn, `node -e "const c=require('crypto');console.log(c.randomBytes(48).toString('hex'));console.log(c.randomBytes(48).toString('hex'))"`);
  const lines = secretRes.out.trim().split('\n').map(l => l.trim()).filter(l => /^[a-f0-9]{96}$/.test(l));
  const JWT_ACCESS = lines[0] || 'please-set-a-strong-access-secret-min-32-chars-here';
  const JWT_REFRESH = lines[1] || 'please-set-a-strong-refresh-secret-min-32-chars-here';
  console.log(`\nGenerated Access Secret (first 12): ${JWT_ACCESS.substring(0, 12)}...`);
  console.log(`Generated Refresh Secret (first 12): ${JWT_REFRESH.substring(0, 12)}...`);

  // ── Step 6: Write .env files ─────────────────────────────────────────────────
  console.log('\n=== STEP 6: Writing .env files ===');

  const apiEnv = [
    'NODE_ENV=production',
    `API_PORT=${STAGING_API_PORT}`,
    'API_PREFIX=api/v1',
    `CORS_ORIGINS=http://200.234.39.163:${STAGING_WEB_PORT}`,
    '',
    'DATABASE_URL=postgresql://elscore_staging:StagingDb2024@localhost:5432/elscore_os_staging',
    '',
    'REDIS_HOST=localhost',
    'REDIS_PORT=6379',
    '',
    `JWT_ACCESS_SECRET=${JWT_ACCESS}`,
    'JWT_ACCESS_EXPIRES_IN=15m',
    `JWT_REFRESH_SECRET=${JWT_REFRESH}`,
    'JWT_REFRESH_EXPIRES_IN=7d',
    '',
    'THROTTLE_TTL_SECONDS=60',
    'THROTTLE_LIMIT=100',
    '',
    'LOG_LEVEL=info',
    '',
    'SYSTEM_TIMEZONE=Asia/Kolkata',
  ].join('\n');

  await sshWrite(conn, `${PROJECT_DIR}/apps/api/.env`, apiEnv);
  console.log('✅ API .env written');

  const webEnv = [
    `API_URL=http://localhost:${STAGING_API_PORT}/api/v1`,
    `NEXT_PUBLIC_API_URL=http://200.234.39.163:${STAGING_API_PORT}/api/v1`,
  ].join('\n');
  await sshWrite(conn, `${PROJECT_DIR}/apps/web/.env.local`, webEnv);
  console.log('✅ Web .env.local written');

  // ── Step 7: Install dependencies ─────────────────────────────────────────────
  console.log('\n=== STEP 7: Installing npm dependencies (may take 2-3 min) ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm install --frozen-lockfile 2>&1 | tail -5`);

  // ── Step 8: Build ─────────────────────────────────────────────────────────────
  console.log('\n=== STEP 8: Building application (may take 3-5 min) ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm run build 2>&1 | tail -30`);

  // ── Step 9: Migrations ────────────────────────────────────────────────────────
  console.log('\n=== STEP 9: Running database migrations ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm --filter api exec prisma migrate deploy 2>&1`);

  // ── Step 10: Seed ─────────────────────────────────────────────────────────────
  console.log('\n=== STEP 10: Seeding database ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pnpm run db:seed 2>&1 | tail -15`);

  // ── Step 11: Copy Next.js static assets ──────────────────────────────────────
  console.log('\n=== STEP 11: Copying Next.js static assets ===');
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/.next/static ${PROJECT_DIR}/apps/web/.next/standalone/.next/ 2>/dev/null || true`);
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/public ${PROJECT_DIR}/apps/web/.next/standalone/ 2>/dev/null || true`);
  console.log('✅ Static assets copied');

  // ── Step 12: PM2 ecosystem config ────────────────────────────────────────────
  console.log('\n=== STEP 12: Writing PM2 ecosystem config ===');
  await sshExec(conn, 'mkdir -p /var/log/elscore');

  const pm2Config = `module.exports = {
  apps: [
    {
      name: 'elscore-api',
      script: '${PROJECT_DIR}/apps/api/dist/main.js',
      cwd: '${PROJECT_DIR}/apps/api',
      instances: 1,
      exec_mode: 'fork',
      error_file: '/var/log/elscore/api-error.log',
      out_file: '/var/log/elscore/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'elscore-web',
      script: '${PROJECT_DIR}/apps/web/.next/standalone/server.js',
      cwd: '${PROJECT_DIR}/apps/web/.next/standalone',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: ${STAGING_WEB_PORT},
        HOSTNAME: '0.0.0.0',
      },
      error_file: '/var/log/elscore/web-error.log',
      out_file: '/var/log/elscore/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
`;
  await sshWrite(conn, `${PROJECT_DIR}/ecosystem.config.js`, pm2Config);
  console.log('✅ PM2 config written');

  // ── Step 13: Start services ───────────────────────────────────────────────────
  console.log('\n=== STEP 13: Starting services with PM2 ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pm2 delete elscore-api 2>/dev/null; pm2 delete elscore-web 2>/dev/null; pm2 start ecosystem.config.js && pm2 save`);
  await sshExec(conn, 'pm2 startup systemd -u root --hp /root 2>/dev/null | tail -5');

  // Wait for services to start
  console.log('\nWaiting 8s for services to start...');
  await new Promise(r => setTimeout(r, 8000));

  // ── Step 14: Final verification ───────────────────────────────────────────────
  console.log('\n=== STEP 14: Final Verification ===');
  await sshExec(conn, 'pm2 list');
  await sshExec(conn, `curl -s -o /dev/null -w "API Status: %{http_code}" http://localhost:${STAGING_API_PORT}/api/v1/auth/me || echo "API starting..."`);
  await sshExec(conn, `curl -s -o /dev/null -w "Web Status: %{http_code}" http://localhost:${STAGING_WEB_PORT}/ || echo "Web starting..."`);

  console.log('\n\n🎉 ================================================');
  console.log('STAGING DEPLOYMENT COMPLETE!');
  console.log('================================================');
  console.log(`Frontend:  http://200.234.39.163:${STAGING_WEB_PORT}`);
  console.log(`API:       http://200.234.39.163:${STAGING_API_PORT}/api/v1`);
  console.log(`Swagger:   http://200.234.39.163:${STAGING_API_PORT}/docs`);
  console.log('Admin:     admin@elscore.internal / ChangeMe123!');
  console.log('================================================\n');

  conn.end();
}

run().catch(err => {
  console.error('\n❌ DEPLOYMENT FAILED:', err.message || err);
  process.exit(1);
});
