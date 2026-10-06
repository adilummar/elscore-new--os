const { Client } = require('ssh2');
const crypto = require('crypto');

const GITHUB_REPO = 'https://github.com/adilummar/elscore-new--os.git';
const PROJECT_DIR = '/var/www/elscore'; // Changed from elscore-os
const PROD_API_PORT = 4001;
const PROD_WEB_PORT = 4000;
const DOMAIN = 'os.elscoreacademy.com';

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
  conn.on('ready', async () => {
    try {
      console.log('=== STEP 1: Removing old directory and cloning repository ===');
      await sshExec(conn, `rm -rf ${PROJECT_DIR} && git clone ${GITHUB_REPO} ${PROJECT_DIR}`);

      console.log('\n=== STEP 2: Creating production database ===');
      const dbScript = `#!/bin/bash
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='elscore_prod'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER elscore_prod WITH PASSWORD 'ProdDb!2026Secure';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='elscore_os_prod'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE elscore_os_prod OWNER elscore_prod;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE elscore_os_prod TO elscore_prod;"
echo "STEP2_OK"
`;
      await sshExec(conn, `cat << 'EOF' > /tmp/create_prod_db.sh\n${dbScript}\nEOF`);
      await sshExec(conn, 'chmod +x /tmp/create_prod_db.sh && /tmp/create_prod_db.sh');

      console.log('\n=== STEP 3: Generating Secure Secrets ===');
      const JWT_ACCESS = crypto.randomBytes(32).toString('hex');
      const JWT_REFRESH = crypto.randomBytes(32).toString('hex');

      console.log('\n=== STEP 4: Writing .env files ===');
      const apiEnv = [
        'NODE_ENV=production',
        'APP_ENV=production',
        `API_PORT=${PROD_API_PORT}`,
        'API_PREFIX=api/v1',
        `CORS_ORIGINS=https://${DOMAIN}`,
        '',
        'DATABASE_URL=postgresql://elscore_prod:ProdDb!2026Secure@localhost:5432/elscore_os_prod',
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
        '',
        'SEED_ADMIN_EMAIL=ceo@elscoreacademy.com',
        'SEED_ADMIN_PASSWORD=ElscoreCEO!2026Secure',
      ].join('\n');
      
      await sshWrite(conn, `${PROJECT_DIR}/apps/api/.env`, apiEnv);
      console.log('✅ API .env written');

      const webEnv = [
        `API_URL=http://localhost:${PROD_API_PORT}/api/v1`,
        `NEXT_PUBLIC_API_URL=https://${DOMAIN}/api/v1`,
        'NEXT_PUBLIC_APP_ENV=production',
      ].join('\n');
      await sshWrite(conn, `${PROJECT_DIR}/apps/web/.env.local`, webEnv);
      console.log('✅ Web .env.local written');

      console.log('\n=== STEP 5: Installing npm dependencies ===');
      await sshExec(conn, `cd ${PROJECT_DIR} && pnpm install --frozen-lockfile 2>&1 | tail -5`);

      console.log('\n=== STEP 6: Running database migrations ===');
      await sshExec(conn, `cd ${PROJECT_DIR} && pnpm --filter api exec prisma migrate deploy 2>&1`);

      console.log('\n=== STEP 7: Generating Prisma Client ===');
      await sshExec(conn, `cd ${PROJECT_DIR} && pnpm --filter api exec prisma generate 2>&1`);

      console.log('\n=== STEP 8: Building application ===');
      await sshExec(conn, `cd ${PROJECT_DIR} && pnpm run build 2>&1 | tail -30`);

      console.log('\n=== STEP 8: Seeding database ===');
      // For production, we don't bypass with NODE_ENV=development. We let it run natively as production.
      await sshExec(conn, `cd ${PROJECT_DIR} && pnpm run db:seed 2>&1 | tail -15`);

      console.log('\n=== STEP 9: Copying Next.js static assets ===');
      await sshExec(conn, `cd ${PROJECT_DIR}/apps/web && cp -r .next/static .next/standalone/apps/web/.next/ && cp -r public .next/standalone/apps/web/`);

      console.log('\n=== STEP 10: Updating ecosystem.config.js ===');
      const ecosystem = `module.exports = {
  apps: [
    {
      name: 'elscore-api-prod',
      script: 'dist/main.js',
      cwd: '${PROJECT_DIR}/apps/api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'production'
      }
    },
    {
      name: 'elscore-web-prod',
      script: 'server.js',
      cwd: '${PROJECT_DIR}/apps/web/.next/standalone/apps/web',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: ${PROD_WEB_PORT},
        HOSTNAME: '0.0.0.0',
        NEXT_PUBLIC_APP_ENV: 'production'
      }
    }
  ]
};`;
      await sshWrite(conn, `${PROJECT_DIR}/ecosystem.config.js`, ecosystem);

      console.log('\n=== STEP 11: PM2 Start/Restart ===');
      await sshExec(conn, `cd ${PROJECT_DIR} && pm2 start ecosystem.config.js --update-env`);
      await sshExec(conn, 'pm2 save');

      console.log('\n=== STEP 12: Final Verification ===');
      await sshExec(conn, 'pm2 list');
      
      console.log('\n\n🎉 ================================================');
      console.log('PRODUCTION DEPLOYMENT COMPLETE!');
      console.log('================================================');
      console.log(`URL:       https://${DOMAIN}`);
      console.log('Admin:     ceo@elscoreacademy.com / ElscoreCEO!2026Secure');
      console.log('================================================\n');

    } catch (err) {
      console.error('ERROR:', err);
    } finally {
      conn.end();
    }
  }).connect({
    host: '200.234.39.163',
    port: 22,
    username: 'root',
    password: 'Elscoreacadrmy@786'
  });
}

run();
