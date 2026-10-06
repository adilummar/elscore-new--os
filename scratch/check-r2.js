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
      console.log("=== Checking AWS/R2 Credentials ===");
      const awsCreds = await sshExecSilent(conn, "cat ~/.aws/credentials 2>/dev/null | grep -E 'aws_access_key_id|aws_secret_access_key' | cut -d= -f1 | tr -d ' ' || echo 'No ~/.aws/credentials'");
      console.log("~/.aws/credentials variables:");
      console.log(awsCreds);

      console.log("=== AWS CLI Test ===");
      const awsCliVersion = await sshExecSilent(conn, "aws --version 2>&1 || echo 'AWS CLI not installed'");
      console.log(awsCliVersion);
      
      console.log("=== Public IP ===");
      const publicIp = await sshExecSilent(conn, "curl -s https://api.ipify.org");
      console.log("Public IPv4: " + publicIp);

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
