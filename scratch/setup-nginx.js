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

function sshWrite(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', resolve);
      ws.on('error', reject);
      ws.write(content);
      ws.end();
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

  // Check existing Nginx config
  console.log('=== Existing Nginx config ===');
  await sshExec(conn, 'ls /etc/nginx/sites-enabled/', 'NGINX');
  await sshExec(conn, 'cat /etc/nginx/sites-enabled/default 2>/dev/null | head -40 || cat /etc/nginx/nginx.conf | head -40', 'NGINX-CONF');
  await sshExec(conn, 'ls /etc/nginx/sites-available/', 'NGINX-AVAIL');

  // Write ElScore Nginx config
  // Uses IP-based virtual hosts since no domain yet
  // Web on /  →  proxy to 3000
  // API on /api/  →  proxy to 3001
  const nginxConfig = `# EL SCORE OS - Staging Nginx Config
# Frontend on port 80 (root path)
server {
    listen 80;
    server_name 200.234.39.163;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Increase header/body size limits for API uploads
    client_max_body_size 10M;

    # API proxy - all /api/* requests go to NestJS on 3001
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Frontend proxy - all other requests go to Next.js on 3000
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Next.js static assets - serve with caching
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
`;

  console.log('\n=== Writing ElScore Nginx config ===');
  await sshWrite(conn, '/etc/nginx/sites-available/elscore', nginxConfig);
  console.log('✅ Config written');

  // Enable the site
  await sshExec(conn, 'ln -sf /etc/nginx/sites-available/elscore /etc/nginx/sites-enabled/elscore', 'LINK');

  // Disable default nginx site that might conflict
  await sshExec(conn, 'rm -f /etc/nginx/sites-enabled/default', 'DISABLE-DEFAULT');

  // Test Nginx config
  console.log('\n=== Testing Nginx config ===');
  await sshExec(conn, 'nginx -t', 'NGINX-TEST');

  // Reload Nginx
  console.log('\n=== Reloading Nginx ===');
  await sshExec(conn, 'systemctl reload nginx && echo "✅ Nginx reloaded"', 'NGINX-RELOAD');

  // Wait a moment
  await new Promise(r => setTimeout(r, 3000));

  // Verify via port 80 now
  console.log('\n=== Verifying via port 80 (public) ===');
  await sshExec(conn, `curl -s -o /dev/null -w "Port 80 root /:     %{http_code}\\n" http://localhost/`, 'PORT80');
  await sshExec(conn, `curl -s -o /dev/null -w "Port 80 /login:     %{http_code}\\n" http://localhost/login`, 'PORT80');
  await sshExec(conn, `curl -s -o /dev/null -w "Port 80 /api/v1/auth/me: %{http_code}\\n" http://localhost/api/v1/auth/me`, 'PORT80');

  // Full login test via port 80 (through nginx)
  console.log('\n=== Login via port 80 (Nginx proxy) ===');
  await sshExec(conn,
    `curl -s -X POST http://localhost/api/v1/auth/login ` +
    `-H "Content-Type: application/json" ` +
    `-d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' ` +
    `| python3 -c "import sys,json; d=json.load(sys.stdin); print('LOGIN via Nginx:', 'PASS ✅' if d.get('data',{}).get('accessToken') else 'FAIL ❌')" 2>/dev/null`,
    'LOGIN'
  );

  console.log('\n\n🎉 ========================================');
  console.log('NGINX CONFIGURED — TRY IN BROWSER:');
  console.log('========================================');
  console.log('🌐  http://200.234.39.163');
  console.log('   (No port number needed — uses port 80)');
  console.log('🔑 admin@elscore.internal / ChangeMe123!');
  console.log('========================================\n');

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message || err);
  process.exit(1);
});
