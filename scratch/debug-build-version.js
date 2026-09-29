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

  // Check current build version & when it was built
  console.log('=== Current web build info ===');
  await sshExec(conn, `ls -la /var/www/elscore-os/apps/web/.next/standalone/apps/web/.next/BUILD_ID 2>&1`);
  await sshExec(conn, `cat /var/www/elscore-os/apps/web/.next/BUILD_ID 2>&1`);
  await sshExec(conn, `cat /var/www/elscore-os/apps/web/.next/standalone/apps/web/.next/BUILD_ID 2>&1`);

  // Check server action chunk to confirm the limit fix is in the built file
  console.log('\n=== Check LeadList build contains limit/pagination ===');
  await sshExec(conn, `grep -r "20 / page\\|Load More\\|totalLoaded\\|Showing.*leads" /var/www/elscore-os/apps/web/.next/standalone/ 2>/dev/null | head -5 || echo "Not found in standalone"`);
  
  // Check the server action file for getLeadsAction
  console.log('\n=== Check if getLeadsAction is in the built bundle ===');
  await sshExec(conn, `grep -r "getLeadsAction\\|leads.*limit" /var/www/elscore-os/apps/web/.next/server/chunks/ 2>/dev/null | head -5 || echo "Not found"`);

  // Look at the actual compiled LeadList chunk to see if it has our new code
  console.log('\n=== Check compiled JS for pagination features ===');
  await sshExec(conn, `grep -r "Load More\\|per page\\|20.*page" /var/www/elscore-os/apps/web/.next/static/chunks/ 2>/dev/null | head -3 || echo "Not found in static"`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
