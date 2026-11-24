/** The 13 grades every salary slab must price, in display order. Matches `grades.code` and the DB trigger. */
export const PAY_SLAB_GRADE_CODES = [
  'KG',
  'GRADE_1',
  'GRADE_2',
  'GRADE_3',
  'GRADE_4',
  'GRADE_5',
  'GRADE_6',
  'GRADE_7',
  'GRADE_8',
  'GRADE_9',
  'GRADE_10',
  'GRADE_11',
  'GRADE_12',
] as const;

export const PAY_SLAB_CURRENCIES = ['INR', 'AED'] as const;
export type PaySlabCurrency = (typeof PAY_SLAB_CURRENCIES)[number];

export const PAY_SLAB_READ = 'tutor_hr.pay_slab.read';
export const PAY_SLAB_CREATE = 'tutor_hr.pay_slab.create';
export const PAY_SLAB_ASSIGN = 'tutor_hr.pay_slab.assign';
export const TUTOR_SALARY_VIEW = 'tutor_hr.tutor_salary.view';

/** Where a slab assignment came from (matches the CHECK in migration 20261124110000_tutor_slab_assignments). */
export const SLAB_SOURCE = {
  DEMO_EVALUATION: 'DEMO_EVALUATION',
  HR_INITIAL: 'HR_INITIAL',
  HR_CHANGE: 'HR_CHANGE',
} as const;
