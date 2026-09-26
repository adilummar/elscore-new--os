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

  // Step 1: Resolve the failed migration marker in the _prisma_migrations table
  console.log('=== Resolve failed migration marker ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "DELETE FROM \\"_prisma_migrations\\" WHERE migration_name = '20260926000001_tutor_lead_assignment_softdelete';" 2>&1`);

  // Step 2: Apply the SQL directly
  console.log('\n=== Apply tutor_lead schema additions ===');
  const sql = `
DO \\$\\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tutor_leads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tutor_leads' AND column_name = 'assigned_to_user_id') THEN
      ALTER TABLE tutor_leads ADD COLUMN assigned_to_user_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tutor_leads' AND column_name = 'converted_tutor_profile_id') THEN
      ALTER TABLE tutor_leads ADD COLUMN converted_tutor_profile_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tutor_leads' AND column_name = 'deleted_at') THEN
      ALTER TABLE tutor_leads ADD COLUMN deleted_at TIMESTAMP(3);
    END IF;
  END IF;
END \\$\\$;
`;
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "${sql.replace(/\n/g, ' ')}" 2>&1`);

  // Step 3: Add indexes
  console.log('\n=== Add indexes ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "CREATE INDEX IF NOT EXISTS tutor_leads_assigned_to_user_id_idx ON tutor_leads(assigned_to_user_id); CREATE INDEX IF NOT EXISTS tutor_leads_deleted_at_idx ON tutor_leads(deleted_at);" 2>&1`);

  // Step 4: Insert the migration as applied
  console.log('\n=== Mark migration as applied ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "INSERT INTO \\"_prisma_migrations\\" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (gen_random_uuid()::text, 'manual', NOW(), '20260926000001_tutor_lead_assignment_softdelete', NULL, NULL, NOW(), 1) ON CONFLICT DO NOTHING;" 2>&1`);

  // Step 5: Verify columns exist
  console.log('\n=== Verify columns ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT column_name FROM information_schema.columns WHERE table_name='tutor_leads' AND column_name IN ('assigned_to_user_id','converted_tutor_profile_id','deleted_at');" 2>&1`);

  console.log('\n✅ Migration fix complete!');
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
