import { readFileSync } from 'fs';
import { join } from 'path';

const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8');

describe('missed-checkout permission seed', () => {
  it('defines a non-delegatable approval permission', () => {
    const start = seed.indexOf("code: 'attendance.missed-checkout.approve'");
    const block = seed.slice(start, seed.indexOf('},', start) + 2);
    expect(block).toContain("action: 'missed-checkout.approve'");
    expect(block).toContain('isDelegatable: false');
  });

  it('assigns the permission only through CEO all-permissions and Sales Head', () => {
    expect(seed).toContain('CEO: ALL_PERMISSION_CODES');
    expect(seed.split("'attendance.missed-checkout.approve'").length - 1).toBe(2);
    const salesHeadStart = seed.indexOf('SALES_HEAD: [');
    const salesCounsellorStart = seed.indexOf('SALES_COUNSELLOR: [');
    expect(seed.slice(salesHeadStart, salesCounsellorStart)).toContain(
      "'attendance.missed-checkout.approve'",
    );
  });
});
