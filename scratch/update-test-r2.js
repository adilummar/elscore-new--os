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
      console.log("=== Updating AWS Credentials ===");
      const awsCreds = `[default]
aws_access_key_id = 420f3eabd504922892ba38e3fdfba069
aws_secret_access_key = 0f366af52fe13178941d2d074453cec6b54f746ded7cc51c22dc2c61416e6060
`;
      await sshExecSilent(conn, `mkdir -p ~/.aws && cat << 'EOF' > ~/.aws/credentials\n${awsCreds}\nEOF`);

      const endpoint = "https://3ecfd7eb6fba0c493a74052dc7e00863.r2.cloudflarestorage.com";
      const bucket = "s3://ellscore-production-new-backup"; // FIXED TYPO
      const fileKey = `backup-verification/test-upload.txt`;
      const s3Uri = `${bucket}/${fileKey}`;

      console.log("=== Running R2 Verification Test ===");
      await sshExecSilent(conn, "echo 'EL SCORE OS R2 BACKUP VERIFICATION' > /tmp/test-upload.txt");

      console.log("Testing PUT...");
      const putRes = await sshExecSilent(conn, `aws s3 cp /tmp/test-upload.txt ${s3Uri} --endpoint-url ${endpoint} 2>&1`);
      console.log("PUT Output: " + putRes);

      console.log("Testing GET...");
      const getRes = await sshExecSilent(conn, `aws s3 cp ${s3Uri} /tmp/downloaded-test.txt --endpoint-url ${endpoint} 2>&1`);
      console.log("GET Output: " + getRes);

      console.log("Testing Content...");
      const catRes = await sshExecSilent(conn, "cat /tmp/downloaded-test.txt 2>&1");
      console.log("Content: " + catRes);

      console.log("Testing DELETE...");
      const delRes = await sshExecSilent(conn, `aws s3 rm ${s3Uri} --endpoint-url ${endpoint} 2>&1`);
      console.log("DELETE Output: " + delRes);
      
      // Cleanup
      await sshExecSilent(conn, "rm -f /tmp/test-upload.txt /tmp/downloaded-test.txt");

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
