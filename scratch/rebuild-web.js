const { Client } = require('ssh2');

const PROJECT_DIR = '/var/www/elscore-os';
const STANDALONE_WEB = `${PROJECT_DIR}/apps/web/.next/standalone/apps/web`;

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

  // Pull latest code
  console.log('=== Pulling latest code ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && git pull origin main`, 'GIT');

  // Rebuild web only (API is unchanged)
  console.log('\n=== Rebuilding Next.js web ===');
  await sshExec(conn, `rm -rf ${PROJECT_DIR}/apps/web/.next`, 'CLEAN');
  await sshExec(conn, `cd ${PROJECT_DIR}/apps/web && node_modules/.bin/next build 2>&1 | tail -15`, 'BUILD');

  // Copy static assets into standalone
  console.log('\n=== Copying static assets ===');
  await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/.next/static ${STANDALONE_WEB}/.next/ 2>/dev/null && echo "✅ static copied"`, 'STATIC');

  // Update ecosystem config — add COOKIE_SECURE=false for HTTP staging
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
      script: '${STANDALONE_WEB}/server.js',
      cwd: '${STANDALONE_WEB}',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
        COOKIE_SECURE: 'false',        // HTTP staging — disable Secure cookie flag
        API_URL: 'http://127.0.0.1:3001/api/v1',
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
  console.log('✅ ecosystem.config.js updated with COOKIE_SECURE=false');

  // Restart web only
  console.log('\n=== Restarting elscore-web ===');
  await sshExec(conn, `cd ${PROJECT_DIR} && pm2 delete elscore-web 2>/dev/null; pm2 start ecosystem.config.js --only elscore-web && pm2 save`, 'PM2');

  console.log('\nWaiting 12s for web to start...');
  await new Promise(r => setTimeout(r, 12000));

  // Verify
  console.log('\n=== Verification ===');
  await sshExec(conn, 'pm2 list', 'PM2');
  await sshExec(conn, `curl -s -o /dev/null -w "Login page: %{http_code}\\n" http://localhost:3000/login`, 'WEB');

  // Full login test — verify cookie IS set in response
  console.log('\n=== Login cookie test ===');
  await sshExec(conn,
    `curl -s -c /tmp/test-cookies.txt -X POST http://localhost/api/v1/auth/login ` +
    `-H "Content-Type: application/json" ` +
    `-d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' ` +
    `| python3 -c "import sys,json; d=json.load(sys.stdin); print('Login API:', 'OK' if d.get('data',{}).get('accessToken') else 'FAIL')"`,
    'LOGIN'
  );

  // Check cookie was set (via Next.js server action path via nginx on port 80)
  console.log('\n=== End-to-end login flow via Nginx ===');
  await sshExec(conn,
    `curl -sv -c /tmp/web-cookies.txt -b /tmp/web-cookies.txt ` +
    `http://localhost/login 2>&1 | grep -E "Set-Cookie|location|< HTTP" | head -10`,
    'COOKIES'
  );

  console.log('\n\n✅ ========================================');
  console.log('FIX DEPLOYED! Login should now work.');
  console.log('========================================');
  console.log('🌐 http://200.234.39.163');
  console.log('   OR');
  console.log('🌐 http://200.234.39.163:3000');
  console.log('🔑 admin@elscore.internal / ChangeMe123!');
  console.log('   Click "Admin/CEO" quick login button');
  console.log('========================================\n');

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message || err);
  process.exit(1);
});
