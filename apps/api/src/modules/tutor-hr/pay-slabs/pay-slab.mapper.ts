import { PAY_SLAB_GRADE_CODES } from './pay-slab.constants';

type RateRow = {
  rate: { toString(): string } | number | string;
  grade: { code: string; name: string; sortOrder: number };
};
export type SlabRow = {
  id: string;
  name: string;
  currency: string;
  createdAt: Date;
  rates: RateRow[];
};

export interface PaySlabView {
  id: string;
  name: string;
  currency: string;
  createdAt: Date;
  minRate: string | null;
  maxRate: string | null;
  rates: Array<{ gradeCode: string; gradeName: string; rate: string }>;
}

const money = (v: RateRow['rate']) => Number(v.toString()).toFixed(2);

/** Plain view of a slab: rates in grade order (KG..Grade 12) with fixed two decimals. */
export function toPaySlabView(s: SlabRow): PaySlabView {
  const order = (c: string) =>
    PAY_SLAB_GRADE_CODES.indexOf(c as (typeof PAY_SLAB_GRADE_CODES)[number]);
  const rates = [...s.rates]
    .sort((a, b) => order(a.grade.code) - order(b.grade.code))
    .map((r) => ({ gradeCode: r.grade.code, gradeName: r.grade.name, rate: money(r.rate) }));
  const nums = rates.map((r) => Number(r.rate));
  return {
    id: s.id,
    name: s.name,
    currency: s.currency,
    createdAt: s.createdAt,
    minRate: nums.length ? Math.min(...nums).toFixed(2) : null,
    maxRate: nums.length ? Math.max(...nums).toFixed(2) : null,
    rates,
  };
}

export const SLAB_WITH_RATES = {
  id: true,
  name: true,
  currency: true,
  createdAt: true,
  rates: { select: { rate: true, grade: { select: { code: true, name: true, sortOrder: true } } } },
} as const;
