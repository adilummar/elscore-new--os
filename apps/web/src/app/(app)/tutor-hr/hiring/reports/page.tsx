"use client";

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getReport, getSources } from '../actions';
import { DECISIONS, STAGES, fmtDate } from '../constants';
import { Empty, ErrorNote, Field, NoAccess, PageHeader, SkeletonRows, StatCard } from '../_components/kit';

export default function HiringReportsPage() {
  const { hasPermission } = usePermissions();
  return hasPermission('tutor_hiring.report') ? <ReportsInner /> : <NoAccess what="recruitment reports" />;
}

function ReportsInner() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [stage, setStage] = useState('');
  const [decision, setDecision] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getSources().then((r) => r.ok && setSources(r.data)); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (sourceId) p.set('sourceId', sourceId);
    if (stage) p.set('stage', stage);
    if (decision) p.set('decision', decision);
    const r = await getReport(p.toString());
    if (r.ok) { setData(r.data); setError(null); } else setError(r.message);
    setLoading(false);
  }, [from, to, sourceId, stage, decision]);
  useEffect(() => { load(); }, [load]);

  const o = data?.outcomes;
  return (
    <div className="space-y-5">
      <PageHeader title="Recruitment report" subtitle="Counts are unique candidates unless stated. Nothing is estimated." />
      <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Field label="From" htmlFor="r-from"><Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="r-to"><Input id="r-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Source" htmlFor="r-src">
          <Select id="r-src" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Stage" htmlFor="r-stage">
          <Select id="r-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Decision" htmlFor="r-dec">
          <Select id="r-dec" value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="">All decisions</option>
            {DECISIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
      </Card>
      <ErrorNote message={error} />
      {loading && !data ? <Card><SkeletonRows rows={5} /></Card> : data && (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Enquiry records" value={data.enquiries.enquiryRecords} hint="A candidate can enquire more than once" />
            <StatCard label="Unique candidates" value={data.enquiries.uniqueCandidates} />
            <StatCard label="Contacted" value={o.contacted} hint="At least one attended call" />
            <StatCard label="CV received" value={o.cvReceived} />
            <StatCard label="Shortlisted" value={o.shortlisted} hint="Reached Live Demo & Interview" />
            <StatCard label="Demo attended" value={o.demoAttended} />
            <StatCard label="Selected" value={o.selected} hint="Accepted or Hired" />
            <StatCard label="Tutors hired" value={o.tutorsHired} />
          </section>
          <p className="text-xs text-slate-500">Training completed: not available. {o.trainingCompletedNote}.</p>

          <Card>
            <CardHeader><CardTitle>By source</CardTitle></CardHeader>
            <CardContent>
              {data.bySource.length === 0 ? <Empty title="No sources configured" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Source</TableHead><TableHead className="text-right">Enquiries</TableHead><TableHead className="text-right">Unique candidates</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.bySource.map((s: any) => (
                      <TableRow key={s.sourceId}><TableCell className="font-medium">{s.source}</TableCell><TableCell className="text-right tabular-nums">{s.enquiryRecords}</TableCell><TableCell className="text-right tabular-nums">{s.uniqueCandidates}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Advertising spend</CardTitle></CardHeader>
            <CardContent>
              {data.advertising.status === 'NOT_ENTERED' ? (
                <Empty title="Ad spend not entered" hint="No spend has been recorded for this selection, so no cost figures are shown. Add spend in Hiring settings." />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    Total entered: {Object.entries(data.advertising.totalsByCurrency).map(([c, a]) => `${c} ${a}`).join(' · ')}
                    <span className="text-xs text-slate-500"> (overlapping periods are counted whole, not prorated)</span>
                  </p>
                  <Table>
                    <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.advertising.entries.map((e: any) => (
                        <TableRow key={e.id}><TableCell>{e.source}</TableCell><TableCell>{fmtDate(e.periodStart)} – {fmtDate(e.periodEnd)}</TableCell><TableCell className="text-right tabular-nums">{e.currency} {e.amount}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
