const fs = require('fs');
const path = 'apps/api/prisma/seed.ts';
let seed = fs.readFileSync(path, 'utf8');

// Replace permissions
const oldPermissions = `  // ── Tutor recruitment ──────────────────────────────────────────────────────────
  {
    code: 'tutor.recruitment.read',
    resource: 'tutor.recruitment',
    action: 'read',
    description: 'View recruitment records and history',
    isDelegatable: true,
  },
  {
    code: 'tutor.recruitment.create',
    resource: 'tutor.recruitment',
    action: 'create',
    description: 'Create a new tutor recruitment enquiry',
    isDelegatable: true,
  },
  {
    code: 'tutor.recruitment.manage',
    resource: 'tutor.recruitment',
    action: 'manage',
    description: 'Advance stages, record interviews, reject, hire',
    isDelegatable: true,
  },`;

const newPermissions = `  // ── Tutor HR Recruitment ──────────────────────────────────────────────────────
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
  },`;

seed = seed.replace(oldPermissions, newPermissions);

// Also replace REC with TL
seed = seed.replace(/\{ entityType: 'REC', prefix: 'REC', padding: 4 \}, \/\/ Tutor recruitment \(new in Phase 1\)/, `{ entityType: 'TL', prefix: 'TL', padding: 4 }, // Tutor Lead`);

fs.writeFileSync(path, seed);
console.log('seed.ts updated.');
