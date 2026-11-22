"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { getStaff, getWorkload } from '../actions';
import { DEMO_STATUS_LABEL, todayLocal } from '../constants';
import { Empty, ErrorNote, PageHeader, SkeletonRows, SlaBadge } from '../_components/kit';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function range(anchor: string, view: View) {
  const a = parse(anchor);
  if (view === 'day') return { from: anchor, to: anchor };
  if (view === 'week') {
    const start = new Date(a); start.setDate(a.getDate() - ((a.getDay() + 6) % 7)); // Monday
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  return { from: ymd(new Date(a.getFullYear(), a.getMonth(), 1)), to: ymd(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
}
function shift(anchor: string, view: View, dir: 1 | -1) {
  const a = parse(anchor);
  if (view === 'day') a.setDate(a.getDate() + dir);
  else if (view === 'week') a.setDate(a.getDate() + 7 * dir);
  else a.setMonth(a.getMonth() + dir, 1);
  return ymd(a);
}

export default function DemoCalendarPage() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(todayLocal());
  const [assignee, setAssignee] = useState('');
  const [status, setStatus] = useState('');
  const [staff, setStaff] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const r = useMemo(() => range(anchor, view), [anchor, view]);

  useEffect(() => { getStaff().then((x) => x.ok && setStaff(x.data)); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ from: r.from, to: r.to });
    if (assignee) p.set('assigneeId', assignee);
    if (status) p.set('status', status);
    const res = await getWorkload(p.toString());
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
    setLoading(false);
  }, [r, assignee, status]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const d of data?.data ?? []) {
      const k = ymd(new Date(d.scheduledAt));
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const title = view === 'month'
    ? parse(r.from).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : view === 'day' ? parse(r.from).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${parse(r.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${parse(r.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Demo calendar" subtitle={data?.scope === 'DEPARTMENT' ? 'All staff' : 'Your demos'} />
      <Card className="p-4 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Previous" onClick={() => setAnchor(shift(anchor, view, -1))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayLocal())}>Today</Button>
          <Button variant="outline" size="sm" aria-label="Next" onClick={() => setAnchor(shift(anchor, view, 1))}><ChevronRight className="w-4 h-4" /></Button>
          <span className="ml-2 font-semibold text-slate-900">{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex rounded-md border border-slate-300 overflow-hidden">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
                className={cn('px-3 h-9 text-sm capitalize', view === v ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50')}>{v}</button>
            ))}
          </div>
          {data?.scope === 'DEPARTMENT' && (
            <Select aria-label="Assignee" className="w-48" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">All staff</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <Select aria-label="Status" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(DEMO_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      </Card>

      <ErrorNote message={error} />

      {data?.summary?.length > 0 && (
        <section aria-label="Workload" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {data.summary.map((w: any) => (
            <Card key={w.userId} className="p-4">
              <p className="text-sm font-medium text-slate-900 truncate">{w.email}</p>
              <p className="text-xs text-slate-500 mt-1">{w.total} total · {w.booked} booked · {w.attended} attended</p>
              {w.overdueEvaluations > 0 && <Badge variant="danger" className="mt-2">{w.overdueEvaluations} evaluation overdue</Badge>}
            </Card>
          ))}
        </section>
      )}

      {loading && !data ? <Card><SkeletonRows rows={5} /></Card> : days.length === 0 ? (
        <Card><Empty title="No demos in this period" hint="Demos booked from a candidate's profile appear here." /></Card>
      ) : (
        <div className="space-y-4">
          {days.map(([day, items]) => (
            <Card key={day}>
              <h2 className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-700 bg-slate-50 rounded-t-lg">
                {parse(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                <span className="ml-2 font-normal text-slate-500">{items.length} demo{items.length === 1 ? '' : 's'}</span>
              </h2>
              <ul className="divide-y divide-slate-100">
                {items.map((d) => (
                  <li key={d.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="w-16 text-sm font-semibold tabular-nums text-slate-900">{new Date(d.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      <div className="min-w-0">
                        <Link className="font-medium text-slate-900 hover:text-brand-700" href={`/tutor-hr/hiring/candidates/${d.tutorLead.id}`}>
                          {`${d.tutorLead.firstName} ${d.tutorLead.lastName}`.trim() || d.tutorLead.businessId}
                        </Link>
                        <p className="text-xs text-slate-500 truncate">{d.assignedTo.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={d.status === 'ATTENDED' ? 'success' : d.status === 'BOOKED' ? 'info' : 'default'}>{DEMO_STATUS_LABEL[d.status] ?? d.status}</Badge>
                      <SlaBadge state={d.evaluationSla?.state} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
