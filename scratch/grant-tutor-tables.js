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

  // Get the DB user the app uses
  const dbUrlOut = await sshExec(conn, `grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-`, { silent: true });
  const dbUser = dbUrlOut.trim().match(/postgresql:\/\/([^:]+)/)?.[1] || 'elscore_staging';
  console.log('DB user:', dbUser);

  // Grant permissions on all tutor_lead* tables
  const tables = [
    'tutor_leads', 'tutor_lead_subjects', 'tutor_lead_grades', 'tutor_lead_languages',
    'tutor_lead_availability', 'tutor_lead_stage_history', 'tutor_lead_calls',
    'tutor_lead_demos', 'tutor_lead_training_sessions', 'tutor_salary_slabs', 'tutor_hr_settings'
  ];

  for (const table of tables) {
    await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "GRANT ALL PRIVILEGES ON TABLE ${table} TO ${dbUser};" 2>&1`, { silent: true });
    process.stdout.write('.');
  }
  console.log('\nGrants done');

  // Also grant on sequences
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${dbUser};" 2>&1`);

  // Verify by testing the API again
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken || '';
  
  console.log('\n=== Test endpoints after grant ===');
  for (const path of ['/tutor-hr/leads', '/tutor-hr/reviews', '/tutor-hr/settings/mother-tongues', '/tutor-hr/settings/salary-slabs']) {
    const code = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1${path} -H "Authorization: Bearer ${token}"`, { silent: true });
    console.log(`  GET ${path}: ${code.trim()}`);
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
