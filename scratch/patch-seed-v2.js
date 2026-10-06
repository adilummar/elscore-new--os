const fs = require('fs');
const path = 'apps/api/prisma/seed.ts';
let content = fs.readFileSync(path, 'utf8');

// Normalize all line endings to LF for reliable processing
content = content.replace(/\r\n/g, '\n');

// HR_MANAGER block: find the section and add granular perms
// Identify HR_MANAGER tutor_lead block: "'tutor_lead.manage',\n    'tutor_lead.training.read',"
const hrMgr = `    'tutor_lead.manage',\n    'tutor_lead.training.read',\n    'tutor_lead.training.manage',\n    'tutor_hr.settings.manage',\n    'tutor.profile.read',\n    'tutor.profile.manage',\n    'tutor.rate.read',\n    'tutor.rate.manage',\n    'tutor.feedback.read',\n    'audit.view',\n  ],`;

const hrMgrNew = `    'tutor_lead.manage',\n    'tutor_lead.create',\n    'tutor_lead.update',\n    'tutor_lead.stage.update',\n    'tutor_lead.approve',\n    'tutor_lead.training.read',\n    'tutor_lead.training.manage',\n    'tutor_hr.settings.manage',\n    'tutor.profile.read',\n    'tutor.profile.manage',\n    'tutor.rate.read',\n    'tutor.rate.manage',\n    'tutor.feedback.read',\n    'audit.view',\n  ],`;

if (content.includes(hrMgr)) {
  content = content.replace(hrMgr, hrMgrNew);
  console.log('✅ HR_MANAGER patched');
} else {
  console.log('❌ HR_MANAGER block not found');
  const idx = content.indexOf("'tutor_lead.manage',");
  console.log('Context:', JSON.stringify(content.slice(idx, idx + 300)));
}

// HR_EXECUTIVE block
const hrExec = `    'tutor_lead.manage',\n    'tutor_lead.training.read',\n    'tutor_lead.training.manage',\n    'tutor_hr.settings.manage',\n    'tutor.profile.read',\n    'tutor.profile.manage',\n    // tutor.rate.read: NOT granted to HR Executive per Revision 3.1\n    // tutor.feedback.read: NOT granted to HR Executive — HR Executive CAN read feedback\n    'tutor.feedback.read',\n  ],`;

const hrExecNew = `    'tutor_lead.manage',\n    'tutor_lead.create',\n    'tutor_lead.update',\n    'tutor_lead.stage.update',\n    // tutor_lead.approve: NOT granted — approval requires HR Manager\n    'tutor_lead.training.read',\n    'tutor_lead.training.manage',\n    'tutor_hr.settings.manage',\n    'tutor.profile.read',\n    'tutor.profile.manage',\n    // tutor.rate.read: NOT granted to HR Executive per Revision 3.1\n    'tutor.feedback.read',\n  ],`;

if (content.includes(hrExec)) {
  content = content.replace(hrExec, hrExecNew);
  console.log('✅ HR_EXECUTIVE patched');
} else {
  // find second occurrence of tutor_lead.manage
  const first = content.indexOf("'tutor_lead.manage',");
  const second = content.indexOf("'tutor_lead.manage',", first + 1);
  if (second > -1) {
    console.log('HR_EXEC context:', JSON.stringify(content.slice(second - 20, second + 300)));
  } else {
    console.log('❌ HR_EXECUTIVE block not found');
  }
}

fs.writeFileSync(path, content);
console.log('Done. File:', content.length, 'chars');
