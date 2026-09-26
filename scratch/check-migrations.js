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

  // List what migrations are in DB
  console.log('=== Migrations in staging DB ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT migration_name, finished_at, rolled_back_at FROM \\"_prisma_migrations\\" ORDER BY started_at;" 2>&1`);

  // Check if tutor_leads exists
  console.log('\n=== Tables matching tutor_ ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'tutor%' ORDER BY tablename;" 2>&1`);

  // Check all migration folders in repo
  console.log('\n=== Migration files in /var/www/elscore-os ===');
  await sshExec(conn, `ls /var/www/elscore-os/apps/api/prisma/migrations/ | sort`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
