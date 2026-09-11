const fs = require('fs');
const path = require('path');

const seedPath = path.resolve('apps/api/prisma/seed.ts');
let seed = fs.readFileSync(seedPath, 'utf8');

// Replace new permissions without isDelegatable
seed = seed.replace(/{ code: 'attendance\.student\.read', resource: 'attendance\.student', action: 'read', description: 'Read student attendance' },/g, "{ code: 'attendance.student.read', resource: 'attendance.student', action: 'read', description: 'Read student attendance', isDelegatable: false },");
seed = seed.replace(/{ code: 'attendance\.student\.mark', resource: 'attendance\.student', action: 'mark', description: 'Mark student attendance' },/g, "{ code: 'attendance.student.mark', resource: 'attendance.student', action: 'mark', description: 'Mark student attendance', isDelegatable: false },");
seed = seed.replace(/{ code: 'attendance\.student\.correct', resource: 'attendance\.student', action: 'correct', description: 'Correct student attendance' },/g, "{ code: 'attendance.student.correct', resource: 'attendance.student', action: 'correct', description: 'Correct student attendance', isDelegatable: false },");
seed = seed.replace(/{ code: 'attendance\.tutor\.read', resource: 'attendance\.tutor', action: 'read', description: 'Read tutor attendance' },/g, "{ code: 'attendance.tutor.read', resource: 'attendance.tutor', action: 'read', description: 'Read tutor attendance', isDelegatable: false },");
seed = seed.replace(/{ code: 'attendance\.tutor\.mark', resource: 'attendance\.tutor', action: 'mark', description: 'Mark tutor attendance' },/g, "{ code: 'attendance.tutor.mark', resource: 'attendance.tutor', action: 'mark', description: 'Mark tutor attendance', isDelegatable: false },");
seed = seed.replace(/{ code: 'attendance\.tutor\.correct', resource: 'attendance\.tutor', action: 'correct', description: 'Correct tutor attendance' },/g, "{ code: 'attendance.tutor.correct', resource: 'attendance.tutor', action: 'correct', description: 'Correct tutor attendance', isDelegatable: false },");
seed = seed.replace(/{ code: 'attendance\.tutor\.verify', resource: 'attendance\.tutor', action: 'verify', description: 'Verify tutor attendance for payroll' },/g, "{ code: 'attendance.tutor.verify', resource: 'attendance.tutor', action: 'verify', description: 'Verify tutor attendance for payroll', isDelegatable: false },");

fs.writeFileSync(seedPath, seed, 'utf8');
console.log('Seed updated with isDelegatable.');
