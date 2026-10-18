const fs = require('fs');
const path = require('path');

const webRoot = path.join(__dirname, '..');
const standaloneWeb = path.join(webRoot, '.next', 'standalone', 'apps', 'web');

if (fs.existsSync(standaloneWeb)) {
  const srcStatic = path.join(webRoot, '.next', 'static');
  const destStatic = path.join(standaloneWeb, '.next', 'static');
  const srcPublic = path.join(webRoot, 'public');
  const destPublic = path.join(standaloneWeb, 'public');

  if (fs.existsSync(srcStatic)) {
    fs.mkdirSync(path.dirname(destStatic), { recursive: true });
    fs.cpSync(srcStatic, destStatic, { recursive: true });
    console.log('[standalone] Successfully copied .next/static to standalone output folder');
  } else {
    console.warn('[standalone] Warning: .next/static does not exist to copy');
  }

  if (fs.existsSync(srcPublic)) {
    fs.mkdirSync(destPublic, { recursive: true });
    fs.cpSync(srcPublic, destPublic, { recursive: true });
    console.log('[standalone] Successfully copied public to standalone output folder');
  }
}
