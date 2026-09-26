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

  // Check salary_slabs columns
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "\\d tutor_salary_slabs" 2>&1`);
  
  // Check API logs for the error
  await sshExec(conn, `pm2 logs elscore-api --lines 20 --nostream 2>&1 | grep -A2 "salary" | head -15`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
