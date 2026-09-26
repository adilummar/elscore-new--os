const fs = require('fs');
const path = 'apps/api/prisma/seed.ts';
let seed = fs.readFileSync(path, 'utf8');

seed = seed.replace(/tutor\.recruitment\.read/g, 'tutor_lead.read');
seed = seed.replace(/tutor\.recruitment\.create/g, 'tutor_lead.manage');
seed = seed.replace(/tutor\.recruitment\.manage/g, 'tutor_lead.training.manage');

// Actually, I can just inject the new permissions at the end of the array, and delete the old ones.
// That's much safer.
const newPerms = `
  {
    code: 'tutor_lead.read',
    resource: 'tutor_lead',
    action: 'read',
    description: 'View tutor leads and their history',
    isDelegatable: true,
  },
  {
    code: 'tutor_lead.manage',
    resource: 'tutor_lead',
    action: 'manage',
    description: 'Create/update tutor leads, change stages, record calls/demos, convert to tutor',
    isDelegatable: true,
  },
  {
    code: 'tutor_lead.training.read',
    resource: 'tutor_lead_training',
    action: 'read',
    description: 'View tutor lead training sessions',
    isDelegatable: true,
  },
  {
    code: 'tutor_lead.training.manage',
    resource: 'tutor_lead_training',
    action: 'manage',
    description: 'Create and update tutor lead training sessions',
    isDelegatable: true,
  },
  {
    code: 'tutor_hr.settings.manage',
    resource: 'tutor_hr_settings',
    action: 'manage',
    description: 'Manage mother tongues, communication languages, and salary slabs',
    isDelegatable: false,
  },
];
`;

seed = seed.replace(/\];\s*\n\s*\/\/\s*={70,}/, newPerms + '\n  // ' + '='.repeat(77));
// But wait, there are multiple `];` before `// ====`. Let's just find `const PERMISSIONS: Array<{...}> = [` and insert it before the closing bracket.
// I will just open `seed.ts` in python or regex and insert it.
