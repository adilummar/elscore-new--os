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

  console.log('\n=== Checking users via PSQL ===');
  await sshExec(`PGPASSWORD=StagingDb2024 psql -U elscore_staging -h localhost -d elscore_os_staging -c "SELECT email FROM users;"`);

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
