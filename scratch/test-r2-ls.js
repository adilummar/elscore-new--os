const { Client } = require('ssh2');

function sshExecSilent(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; });
      stream.stderr.on('data', d => { out += d; });
      stream.on('close', code => resolve(out.trim()));
    });
  });
}

async function run() {
  const conn = new Client();
  conn.on('ready', async () => {
    try {
      const endpoint = "https://3ecfd7eb6fba0c493a74052dc7e00863.r2.cloudflarestorage.com";
      console.log("=== Testing List Buckets ===");
      const listRes = await sshExecSilent(conn, `aws s3 ls --endpoint-url ${endpoint} 2>&1`);
      console.log(listRes);
    } catch (err) {
      console.error("ERROR:", err);
    } finally {
      conn.end();
    }
  }).connect({
    host: '200.234.39.163',
    port: 22,
    username: 'root',
    password: 'Elscoreacadrmy@786'
  });
}

run();
