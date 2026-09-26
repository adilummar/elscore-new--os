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

  const DB = 'elscore_os_staging';
  const DBUSER = 'elscore_staging';

  // Check what's missing
  await sshExec(conn, `sudo -u postgres psql -d ${DB} -c "SELECT tablename FROM pg_tables WHERE tablename IN ('mother_tongues','communication_languages','tutor_salary_slabs') ORDER BY tablename;" 2>&1`);

  // Create missing tables
  const createSQL = `
CREATE TABLE IF NOT EXISTS mother_tongues (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS communication_languages (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Update salary_slabs to include currency if not exists
ALTER TABLE tutor_salary_slabs ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'AED';
`;

  console.log('=== Create missing tables ===');
  await sshExec(conn, `sudo -u postgres psql -d ${DB} -c "${createSQL.replace(/\n/g,' ')}" 2>&1`);

  // Seed some common data
  await sshExec(conn, `sudo -u postgres psql -d ${DB} -c "
INSERT INTO mother_tongues (name) VALUES ('Arabic'),('English'),('Hindi'),('Urdu'),('Malayalam'),('Tamil'),('Telugu'),('Kannada'),('French'),('Mandarin')
ON CONFLICT (name) DO NOTHING;" 2>&1`);

  await sshExec(conn, `sudo -u postgres psql -d ${DB} -c "
INSERT INTO communication_languages (name) VALUES ('English'),('Arabic'),('Hindi'),('Urdu'),('Malayalam'),('Tamil'),('French')
ON CONFLICT (name) DO NOTHING;" 2>&1`);

  // Grant permissions
  const tables = ['mother_tongues','communication_languages','tutor_salary_slabs','tutor_hr_settings'];
  for (const t of tables) {
    await sshExec(conn, `sudo -u postgres psql -d ${DB} -c "GRANT ALL ON TABLE ${t} TO ${DBUSER};" 2>&1`, { silent: true });
    process.stdout.write('.');
  }
  console.log(' Grants done');

  // Add FK from tutor_leads to mother_tongue
  await sshExec(conn, `sudo -u postgres psql -d ${DB} -c "
DO \\$\\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tutor_leads_mother_tongue_id_fkey') THEN
    ALTER TABLE tutor_leads ADD COLUMN IF NOT EXISTS mother_tongue_id TEXT;
    ALTER TABLE tutor_leads ADD CONSTRAINT tutor_leads_mother_tongue_id_fkey FOREIGN KEY (mother_tongue_id) REFERENCES mother_tongues(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END \\$\\$;" 2>&1`);

  // Verify
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken;

  console.log('\n=== Endpoint tests ===');
  for (const path of ['/tutor-hr/leads','/tutor-hr/reviews','/tutor-hr/settings/mother-tongues','/tutor-hr/settings/salary-slabs']) {
    const code = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1${path} -H "Authorization: Bearer ${token}"`, { silent: true });
    console.log(`  ${path}: ${code.trim()}`);
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
