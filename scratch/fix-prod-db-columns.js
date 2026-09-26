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

  const DB = 'PGPASSWORD=ProdDb!2026Secure psql -U elscore_prod -h localhost -d elscore_os_prod';

  console.log('\n=== STEP 1: Check missing columns on production DB ===');
  await sshExec(conn, `${DB} -c "SELECT column_name FROM information_schema.columns WHERE table_name='lead_distribution_events' ORDER BY ordinal_position;"`);

  console.log('\n=== STEP 2: Add missing columns (safe - only if they don\'t exist) ===');
  
  // daily_distribution_order
  await sshExec(conn, `${DB} -c "ALTER TABLE lead_distribution_events ADD COLUMN IF NOT EXISTS daily_distribution_order INTEGER NOT NULL DEFAULT 0;"`);
  console.log('✅ daily_distribution_order added (or already existed)');

  // is_reassignment
  await sshExec(conn, `${DB} -c "ALTER TABLE lead_distribution_events ADD COLUMN IF NOT EXISTS is_reassignment BOOLEAN NOT NULL DEFAULT false;"`);
  console.log('✅ is_reassignment added (or already existed)');
  
  // selected_member_id
  await sshExec(conn, `${DB} -c "ALTER TABLE lead_distribution_events ADD COLUMN IF NOT EXISTS selected_member_id TEXT;"`);
  console.log('✅ selected_member_id added (or already existed)');

  // rr_queue_before / rr_queue_after
  await sshExec(conn, `${DB} -c "ALTER TABLE lead_distribution_events ADD COLUMN IF NOT EXISTS rr_queue_before JSONB;"`);
  await sshExec(conn, `${DB} -c "ALTER TABLE lead_distribution_events ADD COLUMN IF NOT EXISTS rr_queue_after JSONB;"`);
  console.log('✅ rr_queue_before/after added (or already existed)');

  console.log('\n=== STEP 3: Make nullable columns that prod has as NOT NULL ===');
  // received_at and assignment_latency_ms are NOT NULL in prod but nullable in schema - make them nullable
  await sshExec(conn, `${DB} -c "ALTER TABLE lead_distribution_events ALTER COLUMN received_at DROP NOT NULL;"`);
  await sshExec(conn, `${DB} -c "ALTER TABLE lead_distribution_events ALTER COLUMN assignment_latency_ms DROP NOT NULL;"`);
  console.log('✅ received_at and assignment_latency_ms made nullable');

  console.log('\n=== STEP 4: Verify final table structure ===');
  await sshExec(conn, `${DB} -c "\\d lead_distribution_events"`);

  console.log('\n=== STEP 5: Test the query ===');
  await sshExec(conn, `${DB} -c "SELECT id, daily_distribution_order, is_reassignment FROM lead_distribution_events LIMIT 3;"`);

  conn.end();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
