const http = require('http');

function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '200.234.39.163',
      port: 80,
      path: '/api/v1' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    
    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch(e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  const ceoLogin = await request('POST', '/auth/login', { email: 'admin@elscore.internal', password: 'ChangeMe123!' });
  const perms = await request('GET', '/permissions?limit=100', null, ceoLogin.data.data.accessToken);
  console.log(JSON.stringify(perms.data).substring(0, 500));
}
run();
