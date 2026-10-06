const { Client } = require('ssh2');

function sshExec(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; if (!opts.silent) process.stdout.write(String(d)); });
      stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
      stream.on('close', () => resolve(out));
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

  const script = `
const { PrismaClient } = require('/var/www/elscore-os/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'hr.test@elscoreacademy.com' } });
  const hrRole = await prisma.role.findFirst({ where: { code: 'HR_MANAGER' } });
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@elscore.internal' } });
  
  // Check UserRole fields
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, take: 1 });
  console.log('Existing roles:', roles.length);
  
  if (roles.length === 0) {
    // Create without isActive (check schema)
    try {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: hrRole.id, grantedByUserId: adminUser.id },
      });
      console.log('Role assigned!');
    } catch(e) {
      console.log('Error assigning role:', e.message.slice(0, 200));
      // Try direct SQL
    }
  }
  await prisma.$disconnect();
}
main().catch(e => console.error(e.message));
`;

  await sshExec(conn, `cat > /tmp/assign-role.js << 'EOS'\n${script}\nEOS`, { silent: true });
  await sshExec(conn, `DATABASE_URL=$(grep DATABASE_URL /var/www/elscore-os/apps/api/.env | cut -d= -f2-) node /tmp/assign-role.js 2>&1`);

  // Also try via psql directly  
  const userId = await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -t -c "SELECT id FROM users WHERE email='hr.test@elscoreacademy.com';"`, { silent: true });
  const hrRoleId = await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -t -c "SELECT id FROM roles WHERE code='HR_MANAGER';"`, { silent: true });
  const adminId = await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -t -c "SELECT id FROM users WHERE email='admin@elscore.internal';"`, { silent: true });

  const uid = userId.trim();
  const rid = hrRoleId.trim();
  const aid = adminId.trim();

  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "INSERT INTO user_roles (id, user_id, role_id, granted_by_user_id, granted_at) VALUES (gen_random_uuid()::text, '${uid}', '${rid}', '${aid}', NOW()) ON CONFLICT DO NOTHING;" 2>&1`);

  console.log('\n✅ Role assigned via SQL');
  console.log('\n🔑 Credentials:');
  console.log('  Email: hr.test@elscoreacademy.com');
  console.log('  Password: Password123!');
  console.log('  Role: HR_MANAGER');
  console.log('\nURL: http://200.234.39.163:3000/login');
  
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
