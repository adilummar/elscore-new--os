const http = require('http');
http.get('http://200.234.39.163/api/v1/departments', (res) => {
  console.log(res.statusCode);
});
