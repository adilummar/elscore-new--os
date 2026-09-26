const fs = require('fs');
const path = 'apps/api/prisma/seed.ts';
let content = fs.readFileSync(path, 'utf8');

// Add granular permissions to HR_MANAGER (after tutor_lead.manage line in HR_MANAGER block)
// Find the pattern: 'tutor_lead.manage', followed by 'tutor_lead.training.read' in HR_MANAGER section
// We'll add them by inserting after 'tutor_lead.manage' in the first occurrence (HR_MANAGER)

const target1 = `    'tutor_lead.manage',\n    'tutor_lead.training.read',\n    'tutor_lead.training.manage',\n    'tutor_hr.settings.manage',\n    'tutor.profile.read',\n    'tutor.profile.manage',\n    'tutor.rate.read',\n    'tutor.rate.manage',\n    'tutor.feedback.read',\n    'audit.view',\n  ],`;

const replacement1 = `    'tutor_lead.manage',
    'tutor_lead.create',
    'tutor_lead.update',
    'tutor_lead.stage.update',
    'tutor_lead.approve',
    'tutor_lead.training.read',
    'tutor_lead.training.manage',
    'tutor_hr.settings.manage',
    'tutor.profile.read',
    'tutor.profile.manage',
    'tutor.rate.read',
    'tutor.rate.manage',
    'tutor.feedback.read',
    'audit.view',
  ],`;

// Try both CRLF and LF variants
const target1_crlf = target1.replace(/\n/g, '\r\n');
if (content.includes(target1)) {
  content = content.replace(target1, replacement1);
  console.log('HR_MANAGER: replaced (LF)');
} else if (content.includes(target1_crlf)) {
  content = content.replace(target1_crlf, replacement1.replace(/\n/g, '\r\n'));
  console.log('HR_MANAGER: replaced (CRLF)');
} else {
  // Try mixed
  const mixed = `    'tutor_lead.manage',\n    'tutor_lead.training.read',\r\n    'tutor_lead.training.manage',\r\n    'tutor_hr.settings.manage',\r\n    'tutor.profile.read',\r\n    'tutor.profile.manage',\r\n    'tutor.rate.read',\r\n    'tutor.rate.manage',\r\n    'tutor.feedback.read',\r\n    'audit.view',\r\n  ],`;
  if (content.includes(mixed)) {
    content = content.replace(mixed, replacement1.replace(/\n/g, '\r\n'));
    console.log('HR_MANAGER: replaced (mixed)');
  } else {
    // Find and show the actual surrounding text
    const idx = content.indexOf("'tutor_lead.training.read',");
    if (idx > -1) {
      console.log('Context around tutor_lead.training.read:', JSON.stringify(content.slice(idx-100, idx+200)));
    } else {
      console.log('Could not find HR_MANAGER block');
    }
  }
}

// HR_EXECUTIVE: add create, update, stage.update (but NOT approve)
const target2 = `    'tutor_lead.manage',\r\n    'tutor_lead.training.read',\r\n    'tutor_lead.training.manage',\r\n    'tutor_hr.settings.manage',\r\n    'tutor.profile.read',\r\n    'tutor.profile.manage',\r\n    // tutor.rate.read: NOT granted to HR Executive per Revision 3.1\r\n    // tutor.feedback.read: NOT granted to HR Executive — HR Executive CAN read feedback\r\n    'tutor.feedback.read',\r\n  ],`;

const replacement2 = `    'tutor_lead.manage',
    'tutor_lead.create',
    'tutor_lead.update',
    'tutor_lead.stage.update',
    // tutor_lead.approve: NOT granted — approval is HR Manager responsibility
    'tutor_lead.training.read',
    'tutor_lead.training.manage',
    'tutor_hr.settings.manage',
    'tutor.profile.read',
    'tutor.profile.manage',
    // tutor.rate.read: NOT granted to HR Executive per Revision 3.1
    'tutor.feedback.read',
  ],`.replace(/\n/g, '\r\n');

if (content.includes(target2)) {
  content = content.replace(target2, replacement2);
  console.log('HR_EXECUTIVE: replaced');
} else {
  const idx2 = content.lastIndexOf("'tutor_lead.manage',");
  if (idx2 > -1) console.log('Last tutor_lead.manage ctx:', JSON.stringify(content.slice(idx2-20, idx2+200)));
  else console.log('HR_EXECUTIVE block not found');
}

fs.writeFileSync(path, content);
console.log('Done. File size:', content.length);
