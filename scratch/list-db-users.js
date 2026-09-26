const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  
  function sshExec(cmd) {
    return new Promise((resolve, reject) => {
      let out = '';
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => { out += d; process.stdout.write(String(d)); });
        stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
        stream.on('close', code => resolve(out));
      });
    });
  }

  console.log('\n=== Checking API .env DB config ===');
  await sshExec(`cat /var/www/elscore-os/apps/api/.env | grep DATABASE_URL`);

  console.log('\n=== Using Prisma to list users ===');
  await sshExec(`cd /var/www/elscore-os/apps/api && npx prisma studio > /dev/null & sleep 1`);
  // wait, I can just write a quick script and run it with node
  await sshExec(`cat << 'EOF' > /var/www/elscore-os/apps/api/list-users.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { email: true, role: { select: { code: true } } } });
  console.log(JSON.stringify(users, null, 2));
}
main().finally(() => prisma.$disconnect());
EOF`);
  await sshExec(`cd /var/www/elscore-os/apps/api && node list-users.js`);

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
