import * as path from 'path';

/**
 * Pay Slab permissions (owner decision 2026-11-24): only HR_MANAGER (HR Head) and HR_EXECUTIVE (HR Staff) hold them.
 * Tutor Head, Tutor Coordinators, the CEO and the Co-Founder do not, whatever the automatic rules in the seed say.
 */
// Loaded at run time: prisma/ is outside the API tsconfig rootDir, so a static import would break `tsc`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed = require(path.join(__dirname, '../../../prisma/seed')) as {
  PERMISSIONS: Array<{ code: string }>;
  ROLE_PERMISSIONS: Record<string, string[]>;
};

const CODES = ['tutor_hr.pay_slab.read', 'tutor_hr.pay_slab.create'];
const HOLDERS = ['HR_MANAGER', 'HR_EXECUTIVE'];

describe('Pay Slab permissions in the seed', () => {
  it('both codes exist in the catalog', () => {
    const catalog = new Set(seed.PERMISSIONS.map((p) => p.code));
    for (const c of CODES) expect(catalog.has(c)).toBe(true);
  });

  it('are granted to HR_MANAGER and HR_EXECUTIVE, and to no other role', () => {
    for (const [role, codes] of Object.entries(seed.ROLE_PERMISSIONS)) {
      const has = CODES.filter((c) => codes.includes(c));
      if (HOLDERS.includes(role)) expect(has).toEqual(CODES);
      else expect({ role, has }).toEqual({ role, has: [] });
    }
  });
});
