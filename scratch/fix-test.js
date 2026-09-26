const fs = require('fs');

const path = 'apps/api/test/tutor-hr.e2e-spec.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace("import * as request from 'supertest';", "import * as request from 'supertest';\nconst req = request.default || request;");
content = content.replace(/await request/g, 'await req');
content = content.replace(/\\\$/g, '$');
content = content.replace(/\\`/g, '`');

fs.writeFileSync(path, content);
console.log('Fixed test file');
