const { Client } = require('ssh2');

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(String(d)); });
      stream.stderr.on('data', d => { out += d; process.stderr.write('[ERR] ' + String(d)); });
      stream.on('close', code => resolve({ out, code }));
    });
  });
}

const NGINX_CONF = `server {
    listen 80;
    server_name os.elscoreacademy.com;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Increase header/body size limits for API uploads
    client_max_body_size 10M;

    # Production API proxy - all /api/* requests go to NestJS on 4001
    location /api/ {
        proxy_pass http://127.0.0.1:4001;
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

    # Production Frontend proxy - all other requests go to Next.js on 4000
    location / {
        proxy_pass http://127.0.0.1:4000;
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
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
`;

async function run() {
  const conn = new Client();
  conn.on('ready', async () => {
    try {
      console.log("=== Writing Nginx Config for os.elscoreacademy.com ===");
      await sshExec(conn, `cat << 'EOF' > /etc/nginx/sites-available/elscore_prod\n${NGINX_CONF}\nEOF`);
      
      console.log("=== Enabling Site ===");
      await sshExec(conn, `ln -sf /etc/nginx/sites-available/elscore_prod /etc/nginx/sites-enabled/`);
      
      console.log("=== Testing Nginx Config ===");
      const testRes = await sshExec(conn, `nginx -t`);
      if (testRes.code !== 0) throw new Error("Nginx test failed");

      console.log("=== Restarting Nginx ===");
      await sshExec(conn, `systemctl restart nginx`);

      console.log("=== Installing/Running Certbot for SSL ===");
      // Install certbot if not exists
      await sshExec(conn, `apt-get update && apt-get install -y certbot python3-certbot-nginx`);
      // Run certbot
      await sshExec(conn, `certbot --nginx -d os.elscoreacademy.com --non-interactive --agree-tos -m admin@elscore.internal || echo "Certbot warning, ignoring..."`);

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
