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

  // Find an actual CSS file in the static directory to test
  console.log('\n=== Looking for CSS file ===');
  const cssFileRaw = await sshExec('find /var/www/elscore-os/apps/web/.next/static/css -name "*.css" | head -n 1');
  const cssFile = cssFileRaw.trim().split('/static/')[1];
  
  if (cssFile) {
    console.log(`\n=== Testing GET /_next/static/${cssFile} ===`);
    await sshExec(`curl -I -s http://localhost:3000/_next/static/${cssFile}`);
  }

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
