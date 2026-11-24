"use client";

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { fmtDateTime } from '../../hiring/constants';
import { ActionDialog, Empty, ErrorNote, Field, SkeletonRows, runAction, textareaClass } from '../../hiring/_components/kit';
import { RateGrid, gridRates } from '../../pay-slabs/_components/RateGrid';
import { assignTutorSlab, cancelSlabChange, getTutorSalary, listPaySlabs } from '../../pay-slabs/actions';
import { ASSIGNMENT_STATUS, SOURCE_LABEL, fmtMonth, historyStatus, rateRange } from '../../pay-slabs/constants';

type Dlg = null | 'change' | 'cancel';

/** Salary tab of the tutor profile. `canAssign` only decides which buttons show; the API checks it again. */
export function SalaryTab({ tutorId, canAssign }: { tutorId: string; canAssign: boolean }) {
  const [data, setData] = useState<any>(null);
  const [slabs, setSlabs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);

  const load = useCallback(async () => {
    const r = await getTutorSalary(tutorId);
    if (r.ok) { setData(r.data); setError(null); } else setError(r.message);
  }, [tutorId]);
  useEffect(() => { load(); }, [load]);
  // The picker needs the slab list, but only people who can assign ever open it.
  useEffect(() => {
    if (canAssign) listPaySlabs().then((r) => r.ok && setSlabs(r.data));
  }, [canAssign]);

  if (!data) return error ? <ErrorNote message={error} /> : <Card><SkeletonRows rows={4} /></Card>;

  const { current, pending, history } = data;
  const done = (m: string) => { setDlg(null); setNotice(m); load(); };

  return (
    <div className="space-y-5">
      {notice && <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</div>}
      <ErrorNote message={error} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Current pay slab</CardTitle>
            {canAssign && !pending && (
              <Button size="sm" onClick={() => setDlg('change')}>{current ? 'Change slab' : 'Assign slab'}</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-lg font-semibold text-slate-900">{current.slabName}</span>
                <Badge variant="info">{current.currency}</Badge>
                <span className="text-slate-500">since {fmtMonth(current.fromMonth)}</span>
                {current.slab && <span className="text-slate-500">· {rateRange(current.slab)} per hour</span>}
              </div>
              {current.slab && <RateGrid rates={gridRates(current.slab.rates)} currency={current.currency} label={`Hourly rates of ${current.slabName}`} />}
            </>
          ) : (
            <div>
              <p className="font-medium text-slate-900">No slab assigned</p>
              <p className="text-sm text-slate-500 mt-1">
                {canAssign
                  ? `Assigning a slab now starts it this month (${fmtMonth(data.currentMonth)}). It cannot be backdated.`
                  : 'HR has not given this tutor a pay slab yet.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {pending && (
        <div role="status" className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">Change waiting: {pending.slabName} from {fmtMonth(pending.fromMonth)}</p>
            <p className="mt-0.5">Until then the tutor stays on {current?.slabName ?? 'the current slab'}. Set by {pending.changedBy}: {pending.reason}</p>
          </div>
          {canAssign && pending.canCancel && <Button size="sm" variant="outline" onClick={() => setDlg('cancel')}>Cancel this change</Button>}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Slab history</CardTitle>
          <p className="text-xs text-slate-500">Every slab this tutor has had, including cancelled changes. Nothing here is edited or removed.</p>
        </CardHeader>
        {history.length === 0 ? <Empty title="No slab history yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th scope="col" className="px-4 py-3 font-medium">From</th>
                  <th scope="col" className="px-4 py-3 font-medium">To</th>
                  <th scope="col" className="px-4 py-3 font-medium">Slab</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Source</th>
                  <th scope="col" className="px-4 py-3 font-medium">Changed by</th>
                  <th scope="col" className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h: any) => {
                  const st = ASSIGNMENT_STATUS[historyStatus(h, data.currentMonth)];
                  return (
                    <tr key={h.id} className={h.cancelled ? 'bg-slate-50 text-slate-500' : undefined}>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtMonth(h.fromMonth)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{h.cancelled ? '—' : fmtMonth(h.toMonth)}</td>
                      <td className="px-4 py-3"><span className={h.cancelled ? 'line-through' : 'font-medium text-slate-900'}>{h.slabName}</span> <span className="text-xs">{h.currency}</span></td>
                      <td className="px-4 py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="px-4 py-3 whitespace-nowrap">{SOURCE_LABEL[h.source] ?? h.source}</td>
                      <td className="px-4 py-3">{h.changedBy}<br /><span className="text-xs text-slate-500">{fmtDateTime(h.createdAt)}</span></td>
                      <td className="px-4 py-3 max-w-xs break-words">
                        {h.reason}
                        {h.cancelled && (
                          <p className="mt-1 text-xs text-red-700">
                            Cancelled {fmtDateTime(h.cancelled.at)}{h.cancelled.by ? ` by ${h.cancelled.by}` : ''}: {h.cancelled.reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canAssign && (
        <ChangeSlabDialog
          isOpen={dlg === 'change'} tutorId={tutorId} slabs={slabs} currentSlabId={current?.slabId} hasCurrent={!!current}
          currentMonth={fmtMonth(data.currentMonth)} nextMonth={fmtMonth(data.nextMonth)}
          onClose={() => setDlg(null)} onDone={done}
        />
      )}
      {canAssign && pending && (
        <CancelChangeDialog
          isOpen={dlg === 'cancel'} tutorId={tutorId} assignmentId={pending.id}
          summary={`${pending.slabName} from ${fmtMonth(pending.fromMonth)}`}
          onClose={() => setDlg(null)} onDone={done}
        />
      )}
    </div>
  );
}

function ChangeSlabDialog({ isOpen, tutorId, slabs, currentSlabId, hasCurrent, currentMonth, nextMonth, onClose, onDone }: {
  isOpen: boolean; tutorId: string; slabs: any[]; currentSlabId?: string; hasCurrent: boolean;
  currentMonth: string; nextMonth: string; onClose: () => void; onDone: (m: string) => void;
}) {
  const [slabId, setSlabId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (isOpen) { setSlabId(''); setReason(''); setError(null); } }, [isOpen]);
  const chosen = slabs.find((s) => s.id === slabId);

  const submit = async () => {
    setBusy(true);
    const r = await runAction<any>(assignTutorSlab(tutorId, { slabId, reason: reason.trim() }), setError);
    setBusy(false);
    if (r !== null) onDone(hasCurrent ? `Slab change saved. It takes effect from ${nextMonth}.` : `Slab assigned from ${currentMonth}.`);
  };

  return (
    <ActionDialog
      isOpen={isOpen} onClose={onClose} busy={busy} error={error}
      title={hasCurrent ? 'Change pay slab' : 'Assign pay slab'}
      description={hasCurrent
        ? `The new slab takes effect from ${nextMonth}, the next month. Until then the tutor stays on the current slab. You can cancel the change before ${nextMonth} starts.`
        : `This tutor has no slab. The slab starts this month (${currentMonth}) and cannot be backdated.`}
      submitLabel={hasCurrent ? 'Save change' : 'Assign slab'}
      disabled={!slabId || reason.trim().length < 1}
      onSubmit={submit}
    >
      <Field label="Pay slab" required>
        <Select value={slabId} onChange={(e) => setSlabId(e.target.value)}>
          <option value="">Select slab</option>
          {slabs.filter((s) => s.id !== currentSlabId).map((s) => <option key={s.id} value={s.id}>{s.name} · {rateRange(s)}</option>)}
        </Select>
      </Field>
      {chosen && <RateGrid rates={gridRates(chosen.rates)} currency={chosen.currency} label={`Hourly rates of ${chosen.name}`} />}
      <Field label="Reason" required hint="Kept in the slab history with your name.">
        <textarea rows={3} maxLength={500} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

function CancelChangeDialog({ isOpen, tutorId, assignmentId, summary, onClose, onDone }: {
  isOpen: boolean; tutorId: string; assignmentId: string; summary: string; onClose: () => void; onDone: (m: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (isOpen) { setReason(''); setError(null); } }, [isOpen]);

  const submit = async () => {
    setBusy(true);
    const r = await runAction<any>(cancelSlabChange(tutorId, assignmentId, reason.trim()), setError);
    setBusy(false);
    if (r !== null) onDone('Slab change cancelled. The tutor stays on the current slab.');
  };

  return (
    <ActionDialog
      isOpen={isOpen} onClose={onClose} busy={busy} error={error} danger
      title="Cancel this slab change"
      description={`${summary}. The change stays in the history, marked cancelled, and the current slab carries on.`}
      submitLabel="Cancel change"
      disabled={reason.trim().length < 1}
      onSubmit={submit}
    >
      <Field label="Reason" required>
        <textarea rows={3} maxLength={500} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}
