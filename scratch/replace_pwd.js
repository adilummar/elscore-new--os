const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('dist') && !file.includes('.next')) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('e:/elscore new os/apps');

let replacedCount = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('requiresPasswordChange')) {
    const newContent = content.replace(/requiresPasswordChange/g, 'mustChangePassword');
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Replaced in ${file}`);
    replacedCount++;
  }
}
console.log(`Total files modified: ${replacedCount}`);
