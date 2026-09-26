const fs = require('fs');
const path = require('path');

const directory = 'apps/api/src/modules/tutor-hr';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(directory);
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/user-data\.decorator/g, 'current-user.decorator');
  content = content.replace(/UserData/g, 'CurrentUser');
  content = content.replace(/auth\.types/g, 'auth.interface');
  fs.writeFileSync(file, content);
}

console.log('Fixed imports');
