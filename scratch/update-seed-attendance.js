const fs = require('fs');
const path = require('path');

const seedPath = path.resolve('apps/api/prisma/seed.ts');
let seed = fs.readFileSync(seedPath, 'utf8');

const newPermissions = `
  // Slice 2F: Attendance
  { code: 'attendance.student.read', resource: 'attendance.student', action: 'read', description: 'Read student attendance' },
  { code: 'attendance.student.mark', resource: 'attendance.student', action: 'mark', description: 'Mark student attendance' },
  { code: 'attendance.student.correct', resource: 'attendance.student', action: 'correct', description: 'Correct student attendance' },
  { code: 'attendance.tutor.read', resource: 'attendance.tutor', action: 'read', description: 'Read tutor attendance' },
  { code: 'attendance.tutor.mark', resource: 'attendance.tutor', action: 'mark', description: 'Mark tutor attendance' },
  { code: 'attendance.tutor.correct', resource: 'attendance.tutor', action: 'correct', description: 'Correct tutor attendance' },
  { code: 'attendance.tutor.verify', resource: 'attendance.tutor', action: 'verify', description: 'Verify tutor attendance for payroll' },
`;

if (!seed.includes('attendance.student.read')) {
  seed = seed.replace(/const PERMISSIONS: Array<[\s\S]*?> = \[/, (match) => match + newPermissions);
}

const newSequences = `
  { entityType: 'STA', prefix: 'STA-', padding: 7 }, // Student Attendance
  { entityType: 'TCR', prefix: 'TCR-', padding: 7 }, // Tutor Class Record
`;

if (!seed.includes("entityType: 'STA'")) {
  seed = seed.replace(/const SEQUENCES = \[/, (match) => match + newSequences);
}

// Add permissions to roles. ACADEMY_MANAGER, MENTOR, TUTOR (wait, is there a TUTOR role? Let's assume ACADEMY_MANAGER and MENTOR).
// Let's check roles first.
fs.writeFileSync(seedPath, seed, 'utf8');
console.log('Seed updated with basic Attendance permissions and sequences.');
