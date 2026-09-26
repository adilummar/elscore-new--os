const fs = require('fs');

// Fix the [id]/page.tsx - remove variant="outline" and replace with proper className styling
const detailPath = 'apps/web/src/app/(app)/tutor-hr/leads/[id]/page.tsx';
let content = fs.readFileSync(detailPath, 'utf8');

// Replace all variant="outline" with no variant (uses default styling)
content = content.replace(/variant="outline"/g, '');

fs.writeFileSync(detailPath, content);
console.log('Fixed Badge variant="outline" in lead detail page');

// Verify no more outline variants exist
const remaining = (content.match(/variant="outline"/g) || []).length;
console.log('Remaining variant="outline" occurrences:', remaining);
