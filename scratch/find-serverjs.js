const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  console.log('✅ SSH Connected\n');

  function sshExec(cmd) {
    return new Promise((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => process.stdout.write(String(d)));
        stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
        stream.on('close', code => resolve(code));
      });
    });
  }

  const PROJECT = '/var/www/elscore-os';

  // Find the actual server.js location in the new build
  console.log('\n=== Finding server.js in new build ===');
  await sshExec(`find ${PROJECT}/apps/web/.next -name "server.js" 2>/dev/null`);

  // List contents of .next directory
  console.log('\n=== .next directory contents ===');
  await sshExec(`ls -la ${PROJECT}/apps/web/.next/ 2>/dev/null || echo "NOT FOUND"`);

  // Check if build even completed
  console.log('\n=== standalone directory ===');
  await sshExec(`ls -la ${PROJECT}/apps/web/.next/standalone/ 2>/dev/null || echo "standalone not found"`);

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
