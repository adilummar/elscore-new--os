import { PROFILE_TABS, visibleTabs } from '../tutors/constants';

import {
  SLAB_GRADES, SLAB_PERMISSIONS, createSlabBody, fmtMonth, historyStatus, parseBands, rateRange, saveBlocker, slabAccess,
} from './constants';

const EXAMPLE = 'KG-8 = 130, 9-10 = 150, +1/+2 = 170';
const ratesOf = (text: string) => parseBands(text).rates.map((r) => r.rate);

describe('band parser', () => {
  it('expands the example into 13 grades', () => {
    const p = parseBands(EXAMPLE);
    expect(p.complete).toBe(true);
    expect(p.errors).toEqual([]);
    expect(p.missing).toEqual([]);
    expect(p.rates.map((r) => r.code)).toEqual(SLAB_GRADES.map((g) => g.code));
    expect(p.rates.map((r) => r.rate)).toEqual([130, 130, 130, 130, 130, 130, 130, 130, 130, 150, 150, 170, 170]);
  });

  it('puts +1 and +2 on Grades 11 and 12, and accepts them as a range or as plain numbers', () => {
    expect(ratesOf('KG-10 = 100, +1-+2 = 120').slice(11)).toEqual([120, 120]);
    expect(ratesOf('KG-10 = 100, 11 = 110, 12 = 120').slice(11)).toEqual([110, 120]);
  });

  it('accepts new lines, semicolons, lower case, "Grade 9", "G9" and decimals', () => {
    const p = parseBands('kg-8 = 130.5\n9 - 10 = 150;Grade 11 = 160, G12 = 170');
    expect(p.errors).toEqual([]);
    expect(p.rates.map((r) => r.rate)).toEqual([130.5, 130.5, 130.5, 130.5, 130.5, 130.5, 130.5, 130.5, 130.5, 150, 150, 160, 170]);
  });

  it('refuses a missing grade and names it', () => {
    const p = parseBands('KG-8 = 130, 9-10 = 150, +1 = 170');
    expect(p.complete).toBe(false);
    expect(p.missing).toEqual(['Grade 12']);
    expect(p.rates[12].rate).toBeNull();
  });

  it('shows every grade as missing for empty input', () => {
    const p = parseBands('   ');
    expect(p.complete).toBe(false);
    expect(p.missing).toHaveLength(13);
  });

  it('refuses a grade that is set twice instead of overwriting it', () => {
    const p = parseBands('KG-8 = 130, 8-10 = 150, +1/+2 = 170');
    expect(p.complete).toBe(false);
    expect(p.errors).toEqual(['Grade 8 is set twice (130 and 150)']);
    expect(p.rates[8].rate).toBe(130);
  });

  it.each([
    ['an unknown grade', 'KG-8 = 130, 9-13 = 150, +1/+2 = 170'],
    ['a backwards range', 'KG-8 = 130, 10-9 = 150, +1/+2 = 170'],
    ['a band without a rate', 'KG-8, 9-10 = 150, +1/+2 = 170'],
    ['a zero rate', 'KG-8 = 0, 9-10 = 150, +1/+2 = 170'],
    ['a negative rate', 'KG-8 = -5, 9-10 = 150, +1/+2 = 170'],
    ['a rate with 3 decimals', 'KG-8 = 130.123, 9-10 = 150, +1/+2 = 170'],
    ['a rate that is not a number', 'KG-8 = abc, 9-10 = 150, +1/+2 = 170'],
    ['two equals signs', 'KG-8 = 130 = 140, 9-10 = 150, +1/+2 = 170'],
  ])('is not complete with %s', (_label, text) => {
    const p = parseBands(text);
    expect(p.complete).toBe(false);
    expect(p.errors.length).toBeGreaterThan(0);
  });

  it('never throws on odd input', () => {
    for (const t of ['=', '==', '-', ',,,', 'KG-', '+3 = 5', '/ = 4', '1-2-3 = 5', 'KG = ']) {
      expect(() => parseBands(t)).not.toThrow();
      expect(parseBands(t).complete).toBe(false);
    }
  });
});

describe('the confirmation step before saving', () => {
  const ok = parseBands(EXAMPLE);

  it('needs a name, complete rates and the tick, in that order', () => {
    expect(saveBlocker({ name: ' ', parsed: ok, confirmed: true })).toMatch(/name/i);
    expect(saveBlocker({ name: 'French', parsed: parseBands('KG-8 = 130, 8-9 = 1'), confirmed: true })).toMatch(/Fix the rates/);
    expect(saveBlocker({ name: 'French', parsed: parseBands('KG-8 = 130'), confirmed: true })).toMatch(/missing: Grade 9/);
    expect(saveBlocker({ name: 'French', parsed: ok, confirmed: false })).toMatch(/Tick the confirmation/);
  });

  it('allows saving only when everything is in place', () => {
    expect(saveBlocker({ name: 'French', parsed: ok, confirmed: true })).toBeNull();
  });

  it('builds the request from the confirmed grid: trimmed name, currency, 13 rates in grade order', () => {
    const body = createSlabBody({ name: '  French ', currency: 'AED', parsed: ok });
    expect(body.name).toBe('French');
    expect(body.currency).toBe('AED');
    expect(body.rates).toHaveLength(13);
    expect(body.rates[0]).toEqual({ gradeCode: 'KG', rate: 130 });
    expect(body.rates[12]).toEqual({ gradeCode: 'GRADE_12', rate: 170 });
  });

  it('refuses to build a request from incomplete rates', () => {
    expect(() => createSlabBody({ name: 'French', currency: 'INR', parsed: parseBands('KG-8 = 130') })).toThrow();
  });
});

describe('who sees what', () => {
  const holds = (...codes: string[]) => (p: string) => codes.includes(p);
  const { read, create, assign, salaryView } = SLAB_PERMISSIONS;

  it('uses the same permission codes as the API', () => {
    expect([read, create, assign, salaryView]).toEqual([
      'tutor_hr.pay_slab.read', 'tutor_hr.pay_slab.create', 'tutor_hr.pay_slab.assign', 'tutor_hr.tutor_salary.view',
    ]);
  });

  it('shows nothing to someone with no slab permission', () => {
    expect(slabAccess(holds())).toEqual({ canRead: false, canCreate: false, canViewSalary: false, canAssign: false });
  });

  it('read-only users get the list and detail but no Create slab button', () => {
    expect(slabAccess(holds(read))).toMatchObject({ canRead: true, canCreate: false, canAssign: false });
  });

  it('the Create slab button needs create as well as read', () => {
    expect(slabAccess(holds(create)).canCreate).toBe(false);
    expect(slabAccess(holds(read, create)).canCreate).toBe(true);
  });

  it('the Change, Assign and Cancel buttons need assign and the salary tab', () => {
    expect(slabAccess(holds(salaryView)).canAssign).toBe(false);
    expect(slabAccess(holds(assign)).canAssign).toBe(false);
    expect(slabAccess(holds(salaryView, assign))).toMatchObject({ canViewSalary: true, canAssign: true });
  });

  it('the Salary tab appears only with tutor_salary.view, even for viewers who see the HR-only tabs', () => {
    expect(visibleTabs(true, false)).not.toContain('Salary');
    expect(visibleTabs(false, false)).not.toContain('Salary');
    expect(visibleTabs(true, true)).toEqual([...PROFILE_TABS]);
    expect(visibleTabs(false, true)).toContain('Salary');
    expect(visibleTabs(false, true)).not.toContain('HR Internal Notes');
  });
});

describe('display helpers', () => {
  it('shows months as calendar months and an empty end as Present', () => {
    expect(fmtMonth('2026-11-01')).toBe('Nov 2026');
    expect(fmtMonth('2027-01-01')).toBe('Jan 2027');
    expect(fmtMonth(null)).toBe('Present');
  });

  it('shows the lowest to highest rate', () => {
    expect(rateRange({ minRate: '130.00', maxRate: '170.00', currency: 'INR' })).toBe('INR 130 – 170');
    expect(rateRange({ minRate: '130.00', maxRate: '130.00', currency: 'AED' })).toBe('AED 130');
  });

  it('labels a tutor history row', () => {
    const now = '2026-11-01';
    expect(historyStatus({ fromMonth: '2026-12-01', toMonth: null, cancelled: null }, now)).toBe('SCHEDULED');
    expect(historyStatus({ fromMonth: '2026-06-01', toMonth: null, cancelled: null }, now)).toBe('CURRENT');
    expect(historyStatus({ fromMonth: '2026-06-01', toMonth: '2026-11-01', cancelled: null }, now)).toBe('CURRENT');
    expect(historyStatus({ fromMonth: '2026-06-01', toMonth: '2026-10-01', cancelled: null }, now)).toBe('PAST');
    expect(historyStatus({ fromMonth: '2026-12-01', toMonth: null, cancelled: { at: 'x' } }, now)).toBe('CANCELLED');
  });
});
