const http = require('http');
function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = { hostname: '200.234.39.163', port: 80, path: '/api/v1' + path, method: method, headers: { 'Content-Type': 'application/json' } };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(options, res => { let body = ''; res.on('data', d => body += d); res.on('end', () => resolve(JSON.parse(body))); });
    req.on('error', reject); if (data) req.write(JSON.stringify(data)); req.end();
  });
}
async function run() {
  const ceoLogin = await request('POST', '/auth/login', { email: 'admin@elscore.internal', password: 'ChangeMe123!' });
  const roles = await request('GET', '/roles?limit=100', null, ceoLogin.data.accessToken);
  console.log(roles.data);
}
run();
