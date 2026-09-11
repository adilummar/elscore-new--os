const { execSync } = require('child_process');
const tests = ['attendance.e2e-spec.ts', 'lead.e2e-spec.ts', 'round-robin.e2e-spec.ts', 'follow-up.e2e-spec.ts', 'demo.e2e-spec.ts', 'finance-rules.e2e-spec.ts', 'finance-concurrency.e2e-spec.ts', 'test-demo-concurrency.e2e-spec.ts'];

for (const t of tests) {
  console.log('Running ' + t);
  try {
    execSync('node --max-old-space-size=8192 node_modules/jest/bin/jest.js test/' + t, { stdio: 'inherit' });
  } catch (e) {
    console.error(t + ' failed');
  }
}
