const fs = require('fs');
const path = require('path');

const directory = 'apps/web/src/app/(app)/tutor-hr';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('page.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(directory);
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import \{ api \} from "@\/lib\/api\/api";/g, 'import { clientApi as api } from "@/app/(app)/tutor-hr/api";');
  fs.writeFileSync(file, content);
}

console.log('Fixed imports');
