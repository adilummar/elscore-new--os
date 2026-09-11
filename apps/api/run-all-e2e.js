const { execSync } = require('child_process');

const e2eTests = [
  'marketing-ingestion.e2e-spec.ts',
  'attendance.e2e-spec.ts',
  'lead.e2e-spec.ts',
  'round-robin.e2e-spec.ts',
  'follow-up.e2e-spec.ts',
  'demo.e2e-spec.ts',
  'finance-rules.e2e-spec.ts',
  'finance-concurrency.e2e-spec.ts',
  'test-demo-concurrency.e2e-spec.ts'
];

let e2ePass = 0;
let e2eFail = 0;

for (const t of e2eTests) {
  console.log(`\n\n--- Running E2E: ${t} ---`);
  try {
    execSync(`node --max-old-space-size=8192 node_modules/jest/bin/jest.js --config jest.e2e.config.ts test/${t} --forceExit`, { stdio: 'inherit' });
    e2ePass++;
  } catch (e) {
    console.error(`❌ ${t} failed`);
    e2eFail++;
  }
}

console.log(`\n\n======================================`);
console.log(`E2E Summary: ${e2ePass} passed, ${e2eFail} failed`);
console.log(`======================================\n`);
