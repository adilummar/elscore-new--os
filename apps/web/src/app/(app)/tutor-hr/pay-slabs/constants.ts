// Shared (client + server safe) Pay Slab logic. Kept free of React so it can be unit tested.
import type { BadgeVariant } from '../hiring/constants';

/** The 13 grades every slab must price, in display order. Matches the API and the database. */
export const SLAB_GRADES = [
  { code: 'KG', short: 'KG', name: 'KG' },
  ...Array.from({ length: 12 }, (_, i) => ({ code: `GRADE_${i + 1}`, short: String(i + 1), name: `Grade ${i + 1}` })),
] as const;
export const CURRENCIES = ['INR', 'AED'] as const;

export const SLAB_PERMISSIONS = {
  read: 'tutor_hr.pay_slab.read',
  create: 'tutor_hr.pay_slab.create',
  assign: 'tutor_hr.pay_slab.assign',
  salaryView: 'tutor_hr.tutor_salary.view',
} as const;

/** What the signed-in user may see and do. The API enforces the same rules; this only decides what to show. */
export function slabAccess(has: (permission: string) => boolean) {
  return {
    canRead: has(SLAB_PERMISSIONS.read),
    canCreate: has(SLAB_PERMISSIONS.read) && has(SLAB_PERMISSIONS.create),
    canViewSalary: has(SLAB_PERMISSIONS.salaryView),
    // Changing a slab is also pointless without seeing the salary tab it lives on.
    canAssign: has(SLAB_PERMISSIONS.salaryView) && has(SLAB_PERMISSIONS.assign),
  };
}

// ── Band input ──────────────────────────────────────────────────────────────────────────────────

/** Position of each token in the grade list: KG = 0, 1..12 = 1..12. "+1" and "+2" are Grades 11 and 12. */
function tokenIndex(raw: string): number | null {
  const t = raw.trim().toUpperCase().replace(/^GRADE\s*/, '').replace(/^G\s*(?=\d)/, '');
  if (t === 'KG') return 0;
  if (t === '+1') return 11;
  if (t === '+2') return 12;
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 12) return n;
  }
  return null;
}

export interface ParsedBands {
  /** One entry per grade, in order; null where no band covers the grade. */
  rates: Array<{ code: string; rate: number | null }>;
  /** Grades no band covers (by display name). */
  missing: string[];
  /** Problems with what was typed, one sentence each. */
  errors: string[];
  /** All 13 grades priced, no problems. */
  complete: boolean;
}

const RATE_RE = /^\d+(\.\d{1,2})?$/;
const MAX_RATE = 99999999.99;

/**
 * Turns "KG-8 = 130, 9-10 = 150, +1/+2 = 170" into one rate per grade. Bands are separated by commas, semicolons or
 * new lines; inside a band, "/" joins grades and "-" makes a range. A grade covered twice is an error, never
 * silently overwritten, and a missing grade keeps the form from saving.
 */
export function parseBands(input: string): ParsedBands {
  const rates: Array<number | null> = Array(13).fill(null);
  const errors: string[] = [];
  const entries = input.split(/[,;\n]/).map((e) => e.trim()).filter(Boolean);

  for (const entry of entries) {
    const eq = entry.split('=');
    if (eq.length !== 2 || !eq[0].trim() || !eq[1].trim()) {
      errors.push(`"${entry}" is not a band. Write it like KG-8 = 130`);
      continue;
    }
    const rateText = eq[1].trim().replace(/^(INR|AED)\s*/i, '');
    if (!RATE_RE.test(rateText) || Number(rateText) <= 0 || Number(rateText) > MAX_RATE) {
      errors.push(`"${eq[1].trim()}" is not a valid rate (a positive amount with at most 2 decimals)`);
      continue;
    }
    const rate = Number(rateText);
    const covered: number[] = [];
    let bad = false;
    for (const part of eq[0].split('/')) {
      const range = part.trim().split(/(?<=[A-Za-z0-9])\s*-\s*(?=[A-Za-z0-9+])/);
      const ends = range.map(tokenIndex);
      if (range.length > 2 || ends.some((e) => e === null)) {
        errors.push(`"${part.trim()}" is not a grade. Use KG, 1 to 10, +1 (Grade 11) and +2 (Grade 12)`);
        bad = true;
        continue;
      }
      const [a, b] = [ends[0] as number, (ends[1] ?? ends[0]) as number];
      if (a > b) {
        errors.push(`"${part.trim()}" runs backwards. Write the lower grade first`);
        bad = true;
        continue;
      }
      for (let g = a; g <= b; g++) covered.push(g);
    }
    if (bad) continue;
    for (const g of covered) {
      if (rates[g] !== null) {
        errors.push(`${SLAB_GRADES[g].name} is set twice (${rates[g]} and ${rate})`);
      } else rates[g] = rate;
    }
  }

  const missing = SLAB_GRADES.filter((_, i) => rates[i] === null).map((g) => g.name);
  return {
    rates: SLAB_GRADES.map((g, i) => ({ code: g.code, rate: rates[i] })),
    missing,
    errors: [...new Set(errors)],
    complete: missing.length === 0 && errors.length === 0 && entries.length > 0,
  };
}

/** Everything that must be true before Save is enabled, with the first thing still wrong. */
export function saveBlocker(f: { name: string; parsed: ParsedBands; confirmed: boolean }): string | null {
  if (!f.name.trim()) return 'Enter a slab name';
  if (f.parsed.errors.length) return 'Fix the rates first';
  if (f.parsed.missing.length) return `Set a rate for every grade (missing: ${f.parsed.missing.join(', ')})`;
  if (!f.confirmed) return 'Tick the confirmation to save';
  return null;
}

/** The request body for POST /tutor-hr/pay-slabs. Throws if called before the form is complete. */
export function createSlabBody(f: { name: string; currency: string; parsed: ParsedBands }) {
  if (!f.parsed.complete) throw new Error('Slab rates are incomplete');
  return { name: f.name.trim(), currency: f.currency, rates: f.parsed.rates.map((r) => ({ gradeCode: r.code, rate: r.rate as number })) }; // complete, so no null
}

// ── Display helpers ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-01" → "Nov 2026". Plain text parsing: a month is a calendar month, never a moment in a timezone. */
export function fmtMonth(v?: string | null): string {
  if (!v) return 'Present';
  const m = /^(\d{4})-(\d{2})/.exec(v);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v;
}

export function fmtRate(v?: string | number | null): string {
  return v == null ? '—' : String(Number(v));
}

export function rateRange(s: { minRate: string | null; maxRate: string | null; currency: string }): string {
  if (s.minRate == null || s.maxRate == null) return '—';
  return s.minRate === s.maxRate
    ? `${s.currency} ${fmtRate(s.minRate)}`
    : `${s.currency} ${fmtRate(s.minRate)} – ${fmtRate(s.maxRate)}`;
}

export const ASSIGNMENT_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  CURRENT: { label: 'Current', variant: 'success' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  PAST: { label: 'Past', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
};

export const SOURCE_LABEL: Record<string, string> = {
  DEMO_EVALUATION: 'Demo evaluation',
  HR_INITIAL: 'HR first slab',
  HR_CHANGE: 'HR change',
};

/** Status of one row in a tutor's own history (the tutor-side rows carry no status field). */
export function historyStatus(
  row: { fromMonth: string; toMonth: string | null; cancelled: unknown },
  currentMonth: string,
): keyof typeof ASSIGNMENT_STATUS {
  if (row.cancelled) return 'CANCELLED';
  if (row.fromMonth > currentMonth) return 'SCHEDULED';
  return row.toMonth === null || row.toMonth >= currentMonth ? 'CURRENT' : 'PAST';
}
