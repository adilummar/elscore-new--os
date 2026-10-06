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

  // Check the static chunks for "Load More" text (pagination pill text) — confirms new code is in build
  console.log('=== Does static chunks contain new pagination text? ===');
  await sshExec(conn, `grep -rl "Load More\\|20.*page\\|totalLoaded" /var/www/elscore-os/apps/web/.next/static/ 2>/dev/null | head -5`);
  
  // Check the standalone server chunks for pagination text
  console.log('\n=== Standalone server chunks? ===');
  await sshExec(conn, `grep -rl "Load More\\|20.*page" /var/www/elscore-os/apps/web/.next/standalone/ 2>/dev/null | head -5`);

  // Build ID comparison
  console.log('\n=== Build IDs ===');
  await sshExec(conn, `cat /var/www/elscore-os/apps/web/.next/BUILD_ID && echo "---standalone---" && cat /var/www/elscore-os/apps/web/.next/standalone/apps/web/.next/BUILD_ID`);
  
  // Most recent static chunk modification time
  console.log('\n=== Newest static chunks (was anything updated?) ===');
  await sshExec(conn, `ls -lt /var/www/elscore-os/apps/web/.next/static/chunks/ | head -10`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
