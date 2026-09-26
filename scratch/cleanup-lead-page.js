const fs = require('fs');
const path = 'apps/web/src/app/(app)/tutor-hr/leads/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Find the junk leftover from partial replacement
const junkStart = content.indexOf('\n\n      `Approve ${lead.firstName}');
if (junkStart !== -1) {
  const recordCallMarker = '\n  // Record call';
  const endIdx = content.indexOf(recordCallMarker, junkStart);
  if (endIdx !== -1) {
    content = content.slice(0, junkStart) + recordCallMarker + content.slice(endIdx + recordCallMarker.length);
    fs.writeFileSync(path, content);
    console.log('Fixed! Removed junk. File is now', content.length, 'bytes');
  } else {
    console.log('End marker not found - checking file...');
    console.log(content.slice(junkStart, junkStart + 300));
  }
} else {
  console.log('Junk block not found - file may already be clean');
  console.log(content.slice(130 * 80, 155 * 80));
}
