const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
conn.on('ready', () => {
  console.log('✅ Connected to Hostinger via SSH');
  
  const setupCommands = `
    echo "--- Checking OS and installing dependencies ---"
    apt-get update -y > /dev/null
    apt-get install -y git curl build-essential > /dev/null

    echo "--- Checking Node.js ---"
    if ! command -v node > /dev/null; then
      echo "Installing Node.js 20..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
      apt-get install -y nodejs > /dev/null
    else
      node -v
    fi

    echo "--- Checking PNPM ---"
    if ! command -v pnpm > /dev/null; then
      echo "Installing pnpm..."
      npm install -g pnpm > /dev/null
    else
      pnpm -v
    fi

    echo "--- Checking PM2 ---"
    if ! command -v pm2 > /dev/null; then
      echo "Installing PM2..."
      npm install -g pm2 > /dev/null
    fi

    echo "--- Checking SSH Key for GitHub ---"
    if [ ! -f ~/.ssh/id_rsa ]; then
      echo "Generating new SSH key..."
      ssh-keygen -t rsa -b 4096 -C "deploy@elscore" -N "" -f ~/.ssh/id_rsa > /dev/null
    fi
    echo "YOUR PUBLIC SSH KEY (Add this to GitHub Deploy Keys or your Account):"
    cat ~/.ssh/id_rsa.pub

    echo "--- Setting up project directory ---"
    mkdir -p /var/www/elscore-os
    cd /var/www/elscore-os

    echo "Done."
  `;

  conn.exec(setupCommands, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('✅ Setup script completed with code ' + code);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: '200.234.39.163',
  port: 22,
  username: 'root',
  password: 'Elscoreacadrmy@786'
});
