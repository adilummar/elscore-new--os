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
      console.log("=== Updating Server AWS Credentials ===");
      const awsCreds = `[default]
aws_access_key_id = a30a64461b1905124ceefe6cab6bb739
aws_secret_access_key = 681cc68e768651e0c99d042b34d486dbfdf2677ed199ea6861252aa86e7239ca
`;
      await sshExecSilent(conn, `mkdir -p ~/.aws && cat << 'EOF' > ~/.aws/credentials\n${awsCreds}\nEOF`);

      console.log("=== Updating Server backup-db.sh ===");
      // Let's first read it to ensure it exists on the server, or we can just upload the local one!
      // Actually, we created `backup-db.sh` in a previous step, let's just make sure it's on the server.
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
