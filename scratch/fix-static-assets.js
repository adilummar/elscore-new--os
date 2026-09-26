const { Client } = require('ssh2');

const PROJECT = '/var/www/elscore-os';

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { output += d; process.stdout.write(String(d)); });
      stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
      stream.on('close', code => resolve(output));
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
  console.log('✅ SSH Connected\n');

  console.log('\n=== Checking standalone directory structure ===');
  await sshExec(conn, `ls -la ${PROJECT}/apps/web/.next/standalone/`);
  
  console.log('\n=== Checking standalone/.next directory structure ===');
  await sshExec(conn, `ls -la ${PROJECT}/apps/web/.next/standalone/.next/ 2>/dev/null || echo "NOT FOUND"`);
  
  console.log('\n=== Checking standalone/.next/static directory structure ===');
  await sshExec(conn, `ls -la ${PROJECT}/apps/web/.next/standalone/.next/static 2>/dev/null || echo "NOT FOUND"`);

  console.log('\n=== Copying static assets again properly ===');
  // Next.js standalone server looks for static assets in `.next/static` relative to where server.js is run, OR
  // in a `.next` folder in the working directory. Let's make sure they are copied to the right place.
  // The standalone output creates `apps/web/server.js`.
  await sshExec(conn, `mkdir -p ${PROJECT}/apps/web/.next/standalone/apps/web/.next`);
  await sshExec(conn, `cp -r ${PROJECT}/apps/web/.next/static ${PROJECT}/apps/web/.next/standalone/apps/web/.next/`);
  await sshExec(conn, `cp -r ${PROJECT}/apps/web/public ${PROJECT}/apps/web/.next/standalone/apps/web/`);
  
  console.log('\n=== Checking standalone/apps/web/.next directory structure ===');
  await sshExec(conn, `ls -la ${PROJECT}/apps/web/.next/standalone/apps/web/.next/`);

  console.log('\n=== Restarting PM2 process ===');
  await sshExec(conn, 'pm2 restart elscore-web');
  
  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
