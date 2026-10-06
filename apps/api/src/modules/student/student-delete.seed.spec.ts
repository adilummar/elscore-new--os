import { readFileSync } from 'fs';
import { join } from 'path';

const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8');

function roleBlock(name: string): string {
  const start = seed.indexOf(`${name}: [`);
  if (start < 0) throw new Error(`missing role ${name}`);
  let depth = 0;
  for (let index = seed.indexOf('[', start); index < seed.length; index += 1) {
    const char = seed[index];
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return seed.slice(start, index + 1);
    }
  }
  throw new Error(`unclosed role ${name}`);
}

describe('student.delete seed assignment', () => {
  it('defines a non-delegatable student.delete permission', () => {
    const block = seed.slice(seed.indexOf("code: 'student.delete'"), seed.indexOf("code: 'requirement.create'"));
    expect(block).toContain("action: 'delete'");
    expect(block).toContain('isDelegatable: false');
    expect(block).not.toContain('isDelegatable: true');
  });

  it('assigns the permission to Sales Head and the CEO permission set only', () => {
    expect(seed.split("'student.delete'").length - 1).toBe(2);
    expect(roleBlock('SALES_HEAD')).toContain("'student.delete'");
    expect(seed).toContain('CEO: ALL_PERMISSION_CODES');
  });

  it('does not assign the permission to Sales Counsellor, Finance, Tutor, or Co-Founder lists', () => {
    for (const role of [
      'SALES_COUNSELLOR',
      'FINANCE_HEAD',
      'FINANCE_MANAGER',
      'FINANCE_EXECUTIVE',
      'ACCOUNTANT',
      'TUTOR',
      'HR_MANAGER',
    ]) {
      expect(roleBlock(role)).not.toContain('student.delete');
    }
    expect(seed).toContain("['read', 'read-all', 'view'].includes(p.action)");
    expect(seed).not.toContain('CO_FOUNDER: [');
  });
});
