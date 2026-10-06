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
      const bucket = "s3://elscore-production-new-backup";
      const fileKey = `backup-verification/test-upload.txt`;
      const s3Uri = `${bucket}/${fileKey}`;

      console.log("Creating test file...");
      await sshExecSilent(conn, "echo 'EL SCORE OS R2 BACKUP VERIFICATION' > /tmp/test-upload.txt");

      console.log("Testing PUT...");
      const putRes = await sshExecSilent(conn, `aws s3 cp /tmp/test-upload.txt ${s3Uri} --endpoint-url ${endpoint} 2>&1`);
      console.log("PUT Output: " + putRes);

      console.log("Testing GET (HEAD implied)...");
      const getRes = await sshExecSilent(conn, `aws s3 cp ${s3Uri} /tmp/downloaded-test.txt --endpoint-url ${endpoint} 2>&1`);
      console.log("GET Output: " + getRes);

      console.log("Testing Content...");
      const catRes = await sshExecSilent(conn, "cat /tmp/downloaded-test.txt 2>&1");
      console.log("Content: " + catRes);

      console.log("Testing LIST...");
      const listRes = await sshExecSilent(conn, `aws s3 ls ${bucket}/backup-verification/ --endpoint-url ${endpoint} 2>&1`);
      console.log("LIST Output: " + listRes);

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
