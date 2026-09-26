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

  // Check if TL sequence exists
  console.log('=== Check entity_id_sequences for TL ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT * FROM entity_id_sequences WHERE entity_type IN ('TL','TCR') ORDER BY entity_type;" 2>&1`);

  // Add TL sequence if missing
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "INSERT INTO entity_id_sequences (entity_type, prefix, padding, last_value) VALUES ('TL', 'TL', 4, 0) ON CONFLICT (entity_type) DO NOTHING;" 2>&1`);
  
  // Check if mother_tongues table exists
  console.log('\n=== Check reference tables ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT tablename FROM pg_tables WHERE tablename IN ('mother_tongues','communication_languages','tutor_salary_slabs','subjects','grades') ORDER BY tablename;" 2>&1`);

  // Run the seed to make sure tutor_lead permissions exist
  console.log('\n=== Run seed (for permissions + role assignments) ===');
  await sshExec(conn, `cd /var/www/elscore-os && pnpm --filter api exec prisma db seed 2>&1 | tail -10`);

  console.log('\n✅ Done!');
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
