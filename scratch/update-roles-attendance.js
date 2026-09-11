const fs = require('fs');
const path = require('path');

const seedPath = path.resolve('apps/api/prisma/seed.ts');
let seed = fs.readFileSync(seedPath, 'utf8');

// Mentor permissions
seed = seed.replace(
  /MENTOR: \[([^\]]*?)\]/,
  (match, p1) => `MENTOR: [${p1}  'attendance.student.read',\n      'attendance.tutor.read',\n      'attendance.tutor.verify',\n      'attendance.tutor.correct',\n    ]`
);

// Tutor permissions
seed = seed.replace(
  /TUTOR: \[([^\]]*?)\]/,
  (match, p1) => `TUTOR: [${p1}  'attendance.student.read',\n      'attendance.student.mark',\n      'attendance.tutor.read',\n      'attendance.tutor.mark',\n    ]`
);

fs.writeFileSync(seedPath, seed, 'utf8');
console.log('Seed updated with role permissions.');
