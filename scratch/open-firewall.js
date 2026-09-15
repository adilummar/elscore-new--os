const { Client } = require('ssh2');

function sshExec(conn, cmd, label = 'SERVER') {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(`[${label}] ${d}`); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(`[${label} ERR] ${d}`); });
      stream.on('close', code => resolve({ out, code }));
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

  // Check current firewall status
  console.log('=== Current firewall status ===');
  await sshExec(conn, 'ufw status verbose 2>/dev/null || echo "UFW not installed"', 'UFW');
  await sshExec(conn, 'iptables -L INPUT -n --line-numbers 2>/dev/null | head -30', 'IPTABLES');

  // Check what ports are actually listening
  console.log('\n=== Listening ports ===');
  await sshExec(conn, 'ss -tlnp | grep -E "3000|3001|22|80"', 'PORTS');

  // Open firewall for our ports
  console.log('\n=== Opening firewall ports ===');

  // Try UFW first
  await sshExec(conn, `
    if command -v ufw > /dev/null; then
      ufw allow 3000/tcp comment "ElScore Web Frontend"
      ufw allow 3001/tcp comment "ElScore API"
      ufw allow 22/tcp
      ufw --force enable
      echo "UFW rules applied"
    else
      echo "UFW not found, using iptables"
    fi
  `, 'UFW-RULES');

  // Also add iptables rules directly (works even if UFW not installed)
  await sshExec(conn, `
    iptables -C INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
    iptables -C INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
    echo "iptables rules added"
  `, 'IPTABLES-RULES');

  // Save iptables rules to persist after reboot
  await sshExec(conn, `
    if command -v iptables-save > /dev/null; then
      iptables-save > /etc/iptables/rules.v4 2>/dev/null || \
      iptables-save > /etc/iptables.rules 2>/dev/null || \
      echo "Could not persist iptables (will reapply on reboot via PM2 startup)"
    fi
  `, 'PERSIST');

  // Verify the ports are now reachable from outside by checking netfilter
  console.log('\n=== Verifying ports are open ===');
  await sshExec(conn, 'ufw status 2>/dev/null | grep -E "3000|3001" || echo "Check iptables"', 'UFW-CHECK');
  await sshExec(conn, 'iptables -L INPUT -n | grep -E "3000|3001"', 'IPTABLES-CHECK');

  // Confirm web and API are still running
  console.log('\n=== Confirming services still up ===');
  await sshExec(conn, 'pm2 list', 'PM2');
  await sshExec(conn, `curl -s -o /dev/null -w "Web: %{http_code}\\n" http://localhost:3000/login`, 'WEB');
  await sshExec(conn, `curl -s -o /dev/null -w "API: %{http_code}\\n" http://localhost:3001/api/v1/auth/me`, 'API');

  console.log('\n\n✅ ========================================');
  console.log('FIREWALL PORTS OPENED!');
  console.log('========================================');
  console.log('Now try opening in your browser:');
  console.log('🌐  http://200.234.39.163:3000');
  console.log('🔧  http://200.234.39.163:3001/api/v1');
  console.log('========================================\n');

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message || err);
  process.exit(1);
});
