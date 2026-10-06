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

  // The build didn't produce a standalone output because next.config.js might not have output:'standalone'
  // Let's check the next.config.js
  console.log('\n=== next.config.js ===');
  await sshExec(`cat ${PROJECT}/apps/web/next.config.js 2>/dev/null || cat ${PROJECT}/apps/web/next.config.mjs 2>/dev/null || echo "config not found"`);

  // Check if we have a regular .next/server/app directory we can serve with next start
  console.log('\n=== pnpm build output available? ===');
  await sshExec(`ls ${PROJECT}/apps/web/.next/server/ 2>/dev/null`);

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
