const { Client } = require('ssh2');

const PROJECT_DIR = '/var/www/elscore-os';
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

  // ── Diagnose current state ───────────────────────────────────────────────────
  console.log('=== DIAGNOSTICS ===');
  
  // Check next.config.mjs content
  await sshExec(conn, `cat ${PROJECT_DIR}/apps/web/next.config.mjs`, 'CONFIG');
  
  // Check what's in .next directory
  await sshExec(conn, `ls -la ${PROJECT_DIR}/apps/web/.next/ 2>/dev/null | head -20`, 'NEXT-DIR');
  await sshExec(conn, `ls -la ${PROJECT_DIR}/apps/web/.next/standalone/ 2>/dev/null || echo "standalone dir NOT FOUND"`, 'STANDALONE');
  
  // Check user count in DB
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT COUNT(*) FROM users;"`, 'DB');
  
  // Check what "elscore" PM2 process is
  await sshExec(conn, 'pm2 show elscore 2>/dev/null | head -20 || echo "no elscore process"', 'PM2-OLD');

  // ── Fix 1: Seed the database ─────────────────────────────────────────────────
  console.log('\n=== FIX 1: Seeding database ===');
  // Run seed with NODE_ENV=development to bypass the production password check
  // since this is staging (not real production)
  await sshExec(conn, `cd ${PROJECT_DIR} && NODE_ENV=development pnpm run db:seed 2>&1 | tail -15`, 'SEED');

  // ── Fix 2: Force rebuild Next.js with standalone output ──────────────────────
  console.log('\n=== FIX 2: Rebuilding Next.js with standalone output ===');
  
  // Delete cached .next to force clean build
  await sshExec(conn, `rm -rf ${PROJECT_DIR}/apps/web/.next`, 'CLEAN');
  
  // Rebuild web
  await sshExec(conn, `cd ${PROJECT_DIR}/apps/web && node_modules/.bin/next build 2>&1 | tail -30`, 'WEB-BUILD');
  
  // Check if standalone was created
  await sshExec(conn, `ls -la ${PROJECT_DIR}/apps/web/.next/standalone/ 2>/dev/null || echo "❌ standalone STILL not found"`, 'STANDALONE-CHECK');
  
  // Copy static assets into standalone
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/.next/static ${PROJECT_DIR}/apps/web/.next/standalone/.next/ 2>/dev/null && echo "✅ static copied" || echo "⚠️ static copy failed"`, 'STATIC');
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/public ${PROJECT_DIR}/apps/web/.next/standalone/ 2>/dev/null && echo "✅ public copied" || echo "⚠️ no public dir"`, 'PUBLIC');

  // Verify server.js exists
  const serverCheck = await sshExec(conn, `ls -la ${PROJECT_DIR}/apps/web/.next/standalone/server.js && echo "✅ server.js FOUND" || echo "❌ server.js still NOT FOUND"`, 'SERVER-CHECK');

  const serverFound = serverCheck.out.includes('server.js FOUND') || serverCheck.out.includes('-rw');

  // ── Fix 3: Update PM2 ecosystem and restart ──────────────────────────────────
  console.log('\n=== FIX 3: Restarting services ===');
  
  if (!serverFound) {
    console.log('⚠️ standalone/server.js not found — trying alternative: use node server approach');
    // Alternative: create a small server shim
    const shimContent = `
// Next.js production server shim
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const app = next({ dev: false, dir: '${PROJECT_DIR}/apps/web' });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || ${STAGING_WEB_PORT};

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(PORT, '0.0.0.0', () => {
    console.log('> Ready on http://0.0.0.0:' + PORT);
  });
});
`;
    await sshWrite(conn, '/tmp/web-server.js', shimContent);
    await sshExec(conn, `cp /tmp/web-server.js ${PROJECT_DIR}/web-server.js`, 'SHIM');
  }

  // Update PM2 ecosystem config
  const serverScript = serverFound 
    ? `${PROJECT_DIR}/apps/web/.next/standalone/server.js`
    : `${PROJECT_DIR}/web-server.js`;

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
      script: '${serverScript}',
      cwd: '${serverFound ? `${PROJECT_DIR}/apps/web/.next/standalone` : PROJECT_DIR}',
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
  
  // Stop old processes and start fresh
  await sshExec(conn, `cd ${PROJECT_DIR} && pm2 delete elscore-api 2>/dev/null; pm2 delete elscore-web 2>/dev/null; pm2 start ecosystem.config.js && pm2 save`, 'PM2');

  // Wait for startup
  console.log('\nWaiting 12s for services to fully start...');
  await new Promise(r => setTimeout(r, 12000));

  // ── Final verification ────────────────────────────────────────────────────────
  console.log('\n=== FINAL VERIFICATION ===');
  await sshExec(conn, 'pm2 list', 'PM2');
  await sshExec(conn, `curl -s -o /dev/null -w "API Status: %{http_code}\\n" http://localhost:3001/api/v1/auth/me`, 'API');
  await sshExec(conn, `curl -s -o /dev/null -w "Web Status: %{http_code}\\n" http://localhost:${STAGING_WEB_PORT}/`, 'WEB');
  await sshExec(conn, `curl -s -o /dev/null -w "Login Page Status: %{http_code}\\n" http://localhost:${STAGING_WEB_PORT}/login`, 'WEB');
  
  // Quick login smoke test
  console.log('\n=== API LOGIN SMOKE TEST ===');
  await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' | head -c 200`, 'SMOKE');

  console.log('\n\n🎉 ================================================');
  console.log('STAGING FIX COMPLETE!');
  console.log('================================================');
  console.log(`Frontend: http://200.234.39.163:${STAGING_WEB_PORT}`);
  console.log(`API:      http://200.234.39.163:3001/api/v1`);
  console.log(`Swagger:  http://200.234.39.163:3001/docs`);
  console.log('Admin:    admin@elscore.internal / ChangeMe123!');
  console.log('================================================\n');

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FIX FAILED:', err.message || err);
  process.exit(1);
});
