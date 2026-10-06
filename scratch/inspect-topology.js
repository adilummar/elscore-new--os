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
      console.log("=== 1. Checking Staging Path ===");
      const stagingApiEnv = await sshExecSilent(conn, "cat /var/www/elscore-os/apps/api/.env 2>/dev/null | grep -E 'DATABASE_URL|REDIS|PORT|PREFIX' || echo 'No staging .env found'");
      console.log("Staging API Env:\n" + stagingApiEnv + "\n");

      console.log("=== 2. Checking Production Path ===");
      const prodApiEnv = await sshExecSilent(conn, "cat /var/www/elscore/apps/api/.env 2>/dev/null | grep -E 'DATABASE_URL|REDIS|PORT|PREFIX' || echo 'No production .env found'");
      console.log("Production API Env:\n" + prodApiEnv + "\n");
      
      console.log("=== 3. Checking PM2 Processes ===");
      const pm2List = await sshExecSilent(conn, "pm2 jlist 2>/dev/null");
      try {
        const pm2Json = JSON.parse(pm2List);
        pm2Json.forEach(p => {
          console.log(`PM2 App: ${p.name} (ID: ${p.pm_id}) - Status: ${p.pm2_env.status}`);
          console.log(`  Path: ${p.pm2_env.pm_cwd}`);
          console.log(`  PORT: ${p.pm2_env.env?.PORT || 'N/A'}`);
          console.log(`  NODE_ENV: ${p.pm2_env.env?.NODE_ENV || 'N/A'}`);
        });
      } catch (e) {
        console.log("Raw PM2 list:\n" + await sshExecSilent(conn, "pm2 list"));
      }

      console.log("\n=== 4. Checking Redis Keys (BullMQ) ===");
      const redisKeys = await sshExecSilent(conn, "redis-cli --scan --pattern '*bull*' 2>/dev/null | cut -d: -f1,2 | sort | uniq | head -n 20");
      console.log("BullMQ Prefixes in Redis:\n" + redisKeys);

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
