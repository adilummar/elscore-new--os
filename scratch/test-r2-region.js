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
      const bucket = "s3://ellscore-production-new-backup"; 
      const fileKey = `backup-verification/test-upload.txt`;
      const s3Uri = `${bucket}/${fileKey}`;

      await sshExecSilent(conn, "echo 'EL SCORE OS R2 BACKUP VERIFICATION' > /tmp/test-upload.txt");

      console.log("Testing PUT with region auto...");
      const putRes = await sshExecSilent(conn, `aws s3 cp /tmp/test-upload.txt ${s3Uri} --endpoint-url ${endpoint} --region auto 2>&1`);
      console.log("PUT Output: " + putRes);

      const lsRes = await sshExecSilent(conn, `aws s3 ls ${s3Uri} --endpoint-url ${endpoint} --region auto 2>&1`);
      console.log("LS Output: " + lsRes);

      const rmRes = await sshExecSilent(conn, `aws s3 rm ${s3Uri} --endpoint-url ${endpoint} --region auto 2>&1`);
      console.log("RM Output: " + rmRes);

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
