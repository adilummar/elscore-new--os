import { SLAB_GRADES, fmtRate } from '../constants';

/** The 13 rates of a slab, KG to Grade 12. `rates` is a list of { code, rate } (a null rate shows as missing). */
export function RateGrid({
  rates, currency, label,
}: { rates: Array<{ code: string; rate: string | number | null }>; currency: string; label: string }) {
  const byCode = new Map(rates.map((r) => [r.code, r.rate]));
  return (
    <div>
      <dl aria-label={label} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {SLAB_GRADES.map((g) => {
          const v = byCode.get(g.code);
          return (
            <div key={g.code} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{g.name}</dt>
              <dd className={v == null ? 'text-sm font-semibold text-red-600' : 'text-sm font-semibold text-slate-900 tabular-nums'}>
                {v == null ? 'Missing' : fmtRate(v)}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-1.5 text-xs text-slate-500">Hourly rate in {currency}.</p>
    </div>
  );
}

/** API slab rates ({ gradeCode, rate }) in the grid's shape. */
export const gridRates = (rates: Array<{ gradeCode: string; rate: string }>) => rates.map((r) => ({ code: r.gradeCode, rate: r.rate }));
