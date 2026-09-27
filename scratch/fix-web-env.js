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

  // Restart elscore-web with --update-env so it picks up API_URL from ecosystem.config.js
  console.log('=== Restart elscore-web with updated env ===');
  await sshExec(conn, `cd /var/www/elscore-os && pm2 restart ecosystem.config.js --only elscore-web --update-env 2>&1`);

  // Wait for startup
  await new Promise(r => setTimeout(r, 5000));

  // Verify API_URL is now set
  console.log('\n=== Check API_URL in PM2 env ===');
  await sshExec(conn, `pm2 env 12 2>&1 | grep -E "API_URL|NODE_ENV|COOKIE_SECURE|PORT"`);

  // Test that the web server still responds
  console.log('\n=== Web health check ===');
  await sshExec(conn, `curl -s -o /dev/null -w "HTTP status: %{http_code}" http://localhost:3000/`);

  console.log('\n\n✅ Done! API_URL should now be set.');
  console.log('Try creating a lead again at: http://200.234.39.163:3000/tutor-hr/leads/new');
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
