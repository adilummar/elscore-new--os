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
      console.log("=== Nginx Configs ===");
      const nginxConfig = await sshExecSilent(conn, "cat /etc/nginx/sites-available/default 2>/dev/null || echo 'No default'");
      console.log(nginxConfig);
      
      const elscoreConfig = await sshExecSilent(conn, "cat /etc/nginx/sites-available/elscore 2>/dev/null || echo 'No elscore'");
      console.log("\n\n" + elscoreConfig);

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
