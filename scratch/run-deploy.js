const { Client } = require('ssh2');

const PROJECT_DIR = '/var/www/elscore-os';

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  console.log('✅ SSH Connected. Running deployment script...\n');

  conn.exec(`cd ${PROJECT_DIR} && chmod +x deploy.sh && ./deploy.sh`, (err, stream) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    
    stream.on('close', code => {
      console.log(`\nDeployment finished with code ${code}`);
      conn.end();
    });
  });
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
