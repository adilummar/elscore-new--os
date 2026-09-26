const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  
  function sshExec(cmd) {
    return new Promise((resolve, reject) => {
      let out = '';
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => { out += d; process.stdout.write(String(d)); });
        stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
        stream.on('close', code => resolve(out));
      });
    });
  }

  console.log('\n=== Testing Staging API Login (3001) ===');
  await sshExec(`curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}'`);

  console.log('\n\n=== Testing Production API Login (4001) ===');
  await sshExec(`curl -s -X POST http://localhost:4001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}'`);
  
  console.log('\n\n=== Checking Database Users ===');
  await sshExec(`cd /var/www/elscore-os && pnpm --filter api exec prisma studio &>/dev/null &`);
  await sshExec(`su postgres -c "psql -d elscore_os_dev -c \\"SELECT id, email, status FROM \\"User\\" WHERE email='admin@elscore.internal';\\""`);

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
