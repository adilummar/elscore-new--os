export function resolvePeriodToQueryString(searchParams: { from?: string; to?: string; period?: string }): string {
  const from = searchParams.from || '';
  const to = searchParams.to || '';
  const period = searchParams.period || '30d';

  if (from && to) return `?from=${from}&to=${to}`;

  let startDate = from;
  let endDate = to;

  if (!startDate && !endDate) {
    const now = new Date();
    if (period === 'today') {
      now.setHours(0,0,0,0);
      startDate = now.toISOString();
    } else if (period === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString();
    } else if (period === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString();
    }
  }

  return startDate ? `?from=${startDate}${endDate ? `&to=${endDate}` : ''}` : '';
}
