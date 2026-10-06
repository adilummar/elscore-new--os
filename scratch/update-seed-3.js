const fs = require('fs');
const path = 'apps/api/prisma/seed.ts';
let seed = fs.readFileSync(path, 'utf8');

// replace REC with TL in ID Sequences
seed = seed.replace(/\{ entityType: 'REC'.*?\n/g, ''); // remove REC
seed = seed.replace(/\{ entityType: 'EMP', prefix: 'EMP', padding: 4 \},/g, `{ entityType: 'EMP', prefix: 'EMP', padding: 4 },\n    { entityType: 'TL', prefix: 'TL', padding: 4 }, // Tutor Lead\n`);

// replace tutor.recruitment permissions
seed = seed.replace(/\{\s*code:\s*'tutor\.recruitment\.read'[\s\S]*?\},/g, '');
seed = seed.replace(/\{\s*code:\s*'tutor\.recruitment\.create'[\s\S]*?\},/g, '');
seed = seed.replace(/\{\s*code:\s*'tutor\.recruitment\.manage'[\s\S]*?\},/g, '');

const additionalPerms = `
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
`;

seed = seed.replace(/\/\/\s*── Tutor profile ──/g, additionalPerms + '\n    // ── Tutor profile ──');

fs.writeFileSync(path, seed);
console.log('Seed updated perfectly');
