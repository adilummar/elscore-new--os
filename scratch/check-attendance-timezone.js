const { Client } = require('ssh2');

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(String(d)); });
      stream.stderr.on('data', d => process.stderr.write('[STDERR] ' + String(d)));
      stream.on('close', () => resolve(out.trim()));
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
  console.log('=== VPS Timezone Check ===\n');
  
  await sshExec(conn, `timedatectl`);
  console.log('\n=== Node.js server time ===');
  await sshExec(conn, `node -e "console.log('UTC ISO:', new Date().toISOString()); console.log('Local:', new Date().toString()); console.log('IST check (should be +05:30):', Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date()))"`);
  
  console.log('\n=== PostgreSQL server timezone ===');
  await sshExec(conn, `su -c "psql -U postgres -c \\"SHOW timezone;\\"" postgres`);
  
  console.log('\n=== Sample attendance events from DB ===');
  await sshExec(conn, `su -c "psql -U postgres -d elscore_os_staging -c \\"SELECT event_type, timestamp AT TIME ZONE 'UTC' as utc_time, timestamp AT TIME ZONE 'Asia/Kolkata' as ist_time FROM employee_attendance_events ORDER BY timestamp DESC LIMIT 10;\\"" postgres`);
  
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
