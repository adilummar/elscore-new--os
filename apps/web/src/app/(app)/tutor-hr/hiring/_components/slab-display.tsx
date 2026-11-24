export type SlabRate = { gradeCode: string; gradeName: string; rate: string };
export type SlabView = { id: string; name: string; currency: string; minRate: string | null; maxRate: string | null; rates: SlabRate[] };

const trim = (v: string) => String(Number(v));

/** One line for a dropdown: "French · INR 130–140/hr". */
export function slabLabel(s: Pick<SlabView, 'name' | 'currency' | 'minRate' | 'maxRate'>): string {
  if (s.minRate == null || s.maxRate == null) return `${s.name} · ${s.currency}`;
  const range = s.minRate === s.maxRate ? trim(s.minRate) : `${trim(s.minRate)}–${trim(s.maxRate)}`;
  return `${s.name} · ${s.currency} ${range}/hr`;
}

/** Per-grade rates of the selected slab, so the person choosing sees exactly what they are offering. */
export function SlabRates({ slab }: { slab?: SlabView }) {
  if (!slab || !slab.rates?.length) return null;
  return (
    <dl
      aria-label={`Hourly rates of ${slab.name}`}
      className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs"
    >
      {slab.rates.map((r) => (
        <div key={r.gradeCode} className="flex justify-between gap-2">
          <dt className="text-slate-500">{r.gradeCode === 'KG' ? 'KG' : r.gradeName.replace('Grade ', 'G')}</dt>
          <dd className="font-medium text-slate-800">{trim(r.rate)}</dd>
        </div>
      ))}
      <div className="col-span-full text-slate-500">Currency: {slab.currency}, per hour</div>
    </dl>
  );
}
