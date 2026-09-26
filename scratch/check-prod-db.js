const { Client } = require('ssh2');

function sshExec(conn, cmd) {
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

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  console.log('✅ SSH Connected');

  // Get prod DB URL
  await sshExec(conn, 'grep DATABASE_URL /var/www/elscore/apps/api/.env');

  // Check columns on lead_distribution_events table
  console.log('\n=== Columns on lead_distribution_events in PROD DB ===');
  await sshExec(conn, `PGPASSWORD=$(grep DATABASE_URL /var/www/elscore/apps/api/.env | sed "s/.*:\\/\\///" | cut -d@ -f1 | cut -d: -f2) psql "$(grep DATABASE_URL /var/www/elscore/apps/api/.env | cut -d= -f2)" -c "\\d lead_distribution_events" 2>&1 || echo "psql direct failed, trying alternate"`);

  // simpler approach
  await sshExec(conn, `cat /var/www/elscore/apps/api/.env | grep DATABASE_URL`);
  
  conn.end();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
