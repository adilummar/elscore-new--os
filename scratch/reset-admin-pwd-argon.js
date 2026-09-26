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

  console.log('\n=== Updating admin password to ChangeMe123! ===');
  await sshExec(`cat << 'EOF' > /var/www/elscore-os/apps/api/reset-pwd.js
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();
async function main() {
  const hash = await argon2.hash('ChangeMe123!');
  await prisma.user.updateMany({
    where: { email: { in: ['admin@elscore.internal', 'hr.test@elscoreacademy.com'] } },
    data: { passwordHash: hash }
  });
  console.log('Passwords updated to ChangeMe123!');
}
main().finally(() => prisma.$disconnect());
EOF`);
  await sshExec(`cd /var/www/elscore-os/apps/api && node reset-pwd.js`);

  console.log('\n=== Testing Login Again ===');
  await sshExec(`curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}'`);

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
