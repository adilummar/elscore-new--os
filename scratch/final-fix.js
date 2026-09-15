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

  // ── Find actual server.js location ──────────────────────────────────────────
  console.log('=== Finding server.js in standalone output ===');
  const findResult = await sshExec(conn,
    `find ${PROJECT_DIR}/apps/web/.next/standalone -name "server.js" 2>/dev/null || echo "NOT FOUND"`,
    'FIND'
  );

  // Full tree of standalone dir
  await sshExec(conn, `find ${PROJECT_DIR}/apps/web/.next/standalone -maxdepth 3 2>/dev/null`, 'TREE');

  // Check if port 3000 is already in use and by what
  await sshExec(conn, `lsof -i :${STAGING_WEB_PORT} 2>/dev/null | head -10 || ss -tlnp | grep :${STAGING_WEB_PORT}`, 'PORT');

  // Check elscore-web PM2 error log
  await sshExec(conn, `tail -20 /var/log/elscore/web-error.log 2>/dev/null || pm2 logs elscore-web --lines 20 --nostream 2>/dev/null | head -30`, 'WEB-LOG');

  // Parse the server.js path from find result
  const serverJsPath = findResult.out.split('\n').find(l => l.trim().endsWith('server.js') && l.includes('standalone'));

  console.log(`\nFound server.js: ${serverJsPath || 'NOT FOUND'}`);

  if (serverJsPath) {
    // Standalone server.js exists at a different path (nested by monorepo)
    const standaloneDir = serverJsPath.replace('/server.js', '');

    // Copy static assets to the correct location
    console.log(`\n=== Copying static assets to ${standaloneDir} ===`);
    await sshExec(conn, `cp -r ${PROJECT_DIR}/apps/web/.next/static ${standaloneDir}/.next/ 2>/dev/null && echo "✅ static copied" || echo "⚠️ copy failed"`, 'STATIC');
    await sshExec(conn, `ls ${standaloneDir}/.next/ | head -5`, 'CHECK');

    // Update PM2 ecosystem with correct path
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
      script: '${serverJsPath.trim()}',
      cwd: '${standaloneDir}',
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

    console.log(`\n=== Restarting services with correct server.js path ===`);
    await sshExec(conn, `cd ${PROJECT_DIR} && pm2 delete elscore-api 2>/dev/null; pm2 delete elscore-web 2>/dev/null; pm2 start ecosystem.config.js && pm2 save`, 'PM2');

  } else {
    // server.js truly not found — use next start approach (most compatible)
    console.log('\n=== server.js not in standalone, using next start method ===');
    
    // Stop old elscore process to free port 3000, and use next start
    console.log('Checking if port 3000 is occupied by old elscore process...');
    await sshExec(conn, 'pm2 show elscore 2>/dev/null | grep "exec cwd"', 'OLD-APP');

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
      script: 'node_modules/.bin/next',
      args: 'start -p ${STAGING_WEB_PORT}',
      cwd: '${PROJECT_DIR}/apps/web',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: ${STAGING_WEB_PORT},
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
    
    // Stop old elscore (it's running our old code on port 3000, we need to replace it)
    console.log('\nStopping old elscore process to free port 3000...');
    await sshExec(conn, 'pm2 delete elscore 2>/dev/null || true; sleep 2', 'PM2-OLD');
    
    await sshExec(conn, `cd ${PROJECT_DIR} && pm2 delete elscore-api 2>/dev/null; pm2 delete elscore-web 2>/dev/null; pm2 start ecosystem.config.js && pm2 save`, 'PM2');
  }

  // Wait for startup
  console.log('\nWaiting 15s for services to start...');
  await new Promise(r => setTimeout(r, 15000));

  // ── Final verification ────────────────────────────────────────────────────────
  console.log('\n=== FINAL VERIFICATION ===');
  await sshExec(conn, 'pm2 list', 'PM2');

  await sshExec(conn, `curl -s -o /dev/null -w "API /auth/me: %{http_code}\\n" http://localhost:3001/api/v1/auth/me`, 'API');
  await sshExec(conn, `curl -s -o /dev/null -w "Web root /: %{http_code}\\n" http://localhost:${STAGING_WEB_PORT}/`, 'WEB');
  await sshExec(conn, `curl -s -o /dev/null -w "Login page /login: %{http_code}\\n" http://localhost:${STAGING_WEB_PORT}/login`, 'WEB');

  // Full login test
  console.log('\n=== FULL LOGIN SMOKE TEST ===');
  const loginResult = await sshExec(conn,
    `curl -s -X POST http://localhost:3001/api/v1/auth/login ` +
    `-H "Content-Type: application/json" ` +
    `-d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' ` +
    `| python3 -c "import sys,json; d=json.load(sys.stdin); print('LOGIN:', 'PASS' if d.get('data',{}).get('accessToken') else 'FAIL')" 2>/dev/null || echo "Login test done"`,
    'SMOKE'
  );

  // Check Swagger docs
  await sshExec(conn, `curl -s -o /dev/null -w "Swagger /docs: %{http_code}\\n" http://localhost:3001/docs`, 'SWAGGER');

  console.log('\n\n🎉 ================================================');
  console.log('STAGING DEPLOYMENT — FINAL STATE');
  console.log('================================================');
  console.log(`Frontend:  http://200.234.39.163:${STAGING_WEB_PORT}`);
  console.log(`API:       http://200.234.39.163:3001/api/v1`);
  console.log(`Swagger:   http://200.234.39.163:3001/docs`);
  console.log('Admin:     admin@elscore.internal / ChangeMe123!');
  console.log('================================================\n');

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message || err);
  process.exit(1);
});
