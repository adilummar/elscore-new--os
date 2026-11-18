"use client";

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePermissions } from '@/components/providers/AuthProvider';
import {
  CapacityHistory, EXCEPTION_ACTION_LABEL, OwnCapacity, STATE_LABEL, STATE_TONE, TeamCapacity, TeamMentor, barWidth, capacitySentence, hoursText, needingAttention, parseLimit,
} from './capacity-view';
import { mentoringApi } from './mentoring-client';
import { Banner, FIELD_LABEL, MUTED, PANEL, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR } from './mentoring-ui';

const BAR_TONE = { success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-red-600', info: 'bg-sky-600' } as const;

export function UsageBar({ percent, state, label }: { percent: number; state: keyof typeof STATE_TONE; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(percent))} className="h-2 w-full min-w-[6rem] rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${BAR_TONE[STATE_TONE[state]]}`} style={{ width: `${barWidth(percent)}%` }} />
    </div>
  );
}

function warningFor(state: keyof typeof STATE_TONE, remaining: number): string | null {
  if (state === 'OVER') return `You are ${hoursText(-remaining)} hours over your monthly limit. The Mentoring Head can raise the limit or move a student.`;
  if (state === 'FULL') return 'Your monthly hours are fully used. New students cannot be assigned to you without the Mentoring Head approving it.';
  if (state === 'APPROACHING') return `You are close to your monthly limit, with ${hoursText(remaining)} hours left.`;
  return null;
}

/** A Mentor's own capacity. Read only: the limit is set by the Mentoring Head and nothing here changes it. */
export function MentorCapacityCard({ capacity }: { capacity: OwnCapacity }) {
  const warning = warningFor(capacity.state, capacity.remainingHours);
  return (
    <section aria-label="My monthly capacity" className={`${PANEL} space-y-3 p-4`} data-testid="mentor-capacity" data-state={capacity.state.toLowerCase()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">My monthly capacity</h2>
        <StatusChip tone={STATE_TONE[capacity.state]}>{STATE_LABEL[capacity.state]}</StatusChip>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['Monthly limit', `${hoursText(capacity.limitHours)} h`],
          ['Allocated student hours', `${hoursText(capacity.allocatedHours)} h`],
          ['Remaining', `${hoursText(capacity.remainingHours)} h`],
          ['Utilization', `${hoursText(capacity.utilizationPercent)}%`],
        ] as const).map(([k, v]) => (
          <div key={k} className="rounded-md bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-600">{k}</dt>
            <dd className="text-lg font-semibold text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <UsageBar percent={capacity.utilizationPercent} state={capacity.state} label="Monthly hours used" />
      {warning && <Banner tone={capacity.state === 'OVER' ? 'error' : 'warning'}>{warning}</Banner>}
      <p className={`text-xs ${MUTED}`}>Each student&apos;s full monthly hours count here, however their hours are shared between tutors. Only the Mentoring Head can change your limit.</p>
      <div>
        <h3 className="text-sm font-medium text-slate-800">Students using your hours ({capacity.students.length})</h3>
        {capacity.students.length === 0 ? <p className={`mt-1 text-sm ${MUTED}`}>No students are assigned to you.</p> : (
          <ul className="mt-1 divide-y divide-slate-100 text-sm" aria-label="Contributing students">
            {capacity.students.map((s) => (
              <li key={s.activationId} className="flex items-center justify-between gap-3 py-1.5">
                <Link href={`/mentoring/students/${s.activationId}`} className="text-brand-700 hover:underline">{s.studentName || 'Student'}{s.studentBusinessId ? ` (${s.studentBusinessId})` : ''}</Link>
                <span className="whitespace-nowrap text-slate-700">{hoursText(s.monthlyHours)} h</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LimitEditor({ mentor, onSaved, onError }: { mentor: TeamMentor; onSaved: () => void; onError: (message: string) => void }) {
  const [limit, setLimit] = React.useState(hoursText(mentor.limitHours));
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setLimit(hoursText(mentor.limitHours)); }, [mentor.limitHours]);
  const parsed = parseLimit(limit);
  const changed = parsed !== null && parsed !== mentor.limitHours;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!changed || parsed === null) return;
        setBusy(true);
        try {
          await mentoringApi(`/mentoring/capacity/mentors/${mentor.mentorUserId}/limit`, 'PUT', { monthlyHourLimit: parsed, reason: reason.trim() || undefined });
          setReason('');
          onSaved();
        } catch (err) {
          onError(err instanceof Error ? err.message : 'The limit could not be saved.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="text-xs"><span className="sr-only">{`Monthly hour limit for ${mentor.name}`}</span>
        <div className="w-24"><Input aria-label={`Monthly hour limit for ${mentor.name}`} type="number" min={0} max={1000} step="0.5" value={limit} onChange={(e) => setLimit(e.target.value)} aria-invalid={parsed === null} /></div>
      </label>
      <label className="text-xs"><span className="sr-only">{`Reason for changing the limit of ${mentor.name}`}</span>
        <div className="w-44"><Input aria-label={`Reason for changing the limit of ${mentor.name}`} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></div>
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={!changed} isLoading={busy}>Save limit</Button>
    </form>
  );
}

function HistoryPanel({ mentor }: { mentor: TeamMentor }) {
  const [h, setH] = React.useState<CapacityHistory | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    mentoringApi(`/mentoring/capacity/mentors/${mentor.mentorUserId}/history`).then((d: CapacityHistory) => { if (live) setH(d); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'The history could not be loaded.'); });
    return () => { live = false; };
  }, [mentor.mentorUserId, mentor.limitHours]);
  if (error) return <p role="alert" className="text-xs text-red-700">{error}</p>;
  if (!h) return <p className={`text-xs ${MUTED}`}>Loading the history...</p>;
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-3 text-xs" data-testid="capacity-history">
      <div>
        <h4 className="font-semibold text-slate-800">Limit changes</h4>
        {h.changes.length === 0 ? <p className={MUTED}>No changes yet.</p> : (
          <ul className="mt-1 space-y-0.5">{h.changes.map((c) => <li key={c.id}>{when(c.createdAt)}: {c.oldLimit === null ? 'set to' : `${hoursText(c.oldLimit)} h to`} {hoursText(c.newLimit)} h by {c.changedByName}{c.reason ? `. ${c.reason}` : ''}</li>)}</ul>
        )}
      </div>
      <div>
        <h4 className="font-semibold text-slate-800">Approved over-capacity exceptions</h4>
        {h.exceptions.length === 0 ? <p className={MUTED}>None.</p> : (
          <ul className="mt-1 space-y-0.5">{h.exceptions.map((x) => <li key={x.id}>{when(x.createdAt)}: {EXCEPTION_ACTION_LABEL[x.action] ?? x.action}, {hoursText(x.studentHours)} h, {hoursText(x.allocatedAfter)} of {hoursText(x.limitAtApproval)} h after. Approved by {x.approvedByName}: {x.reason}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

/** Every Mentor's capacity. The Mentoring Head (who holds staff management) can change a limit here; everyone else who sees it can only read. */
export function TeamCapacityView({ team, canManage, onChanged }: { team: TeamCapacity; canManage: boolean; onChanged: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const attention = needingAttention(team);
  return (
    <section aria-label="Mentor capacity" className="space-y-3" data-testid="team-capacity">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Mentor monthly capacity</h2>
        <span className={`text-sm ${MUTED}`}>Team: {hoursText(team.totals.allocatedHours)} of {hoursText(team.totals.limitHours)} hours used ({hoursText(team.totals.utilizationPercent)}%)</span>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {([['Approaching', team.counts.approaching, 'text-amber-700'], ['Fully utilized', team.counts.full, 'text-sky-700'], ['Over capacity', team.counts.over, 'text-red-700']] as const).map(([k, v, tone]) => (
          <div key={k} className="rounded-md bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-600">{k}</dt><dd className={`text-lg font-semibold ${v > 0 ? tone : 'text-slate-900'}`}>{v}</dd></div>
        ))}
      </dl>
      {attention.length > 0 && (
        <Banner tone={attention.some((m) => m.state === 'OVER') ? 'error' : 'warning'}>
          Needs attention: {attention.map((m) => `${m.name} (${STATE_LABEL[m.state].toLowerCase()}, ${hoursText(m.utilizationPercent)}%)`).join('; ')}.
        </Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <caption className="sr-only">Monthly hour capacity of each Mentor</caption>
          <thead className={THEAD}><tr>{['Mentor', 'Limit', 'Allocated', 'Remaining', 'Utilization', 'Students', 'State', ''].map((h, i) => <th key={i} scope="col" className={TH}>{h || <span className="sr-only">Details</span>}</th>)}</tr></thead>
          <tbody>
            {team.mentors.length === 0 && <tr><td colSpan={8} className={`${TD} ${MUTED}`}>No Mentor profiles yet.</td></tr>}
            {team.mentors.map((m) => (
              <React.Fragment key={m.mentorUserId}>
                <tr className={TR} data-testid="capacity-row" data-state={m.state.toLowerCase()}>
                  <td className={`${TD} font-medium text-slate-900`}>{m.name}{!m.isActive && <span className={`ml-1 text-xs ${MUTED}`}>inactive</span>}</td>
                  <td className={TD}>{hoursText(m.limitHours)} h{m.limitIsDefault && <span className={`block text-xs ${MUTED}`}>default</span>}</td>
                  <td className={TD}>{hoursText(m.allocatedHours)} h</td>
                  <td className={TD}>{hoursText(m.remainingHours)} h</td>
                  <td className={`${TD} w-40`}><span className="block text-xs">{hoursText(m.utilizationPercent)}%</span><UsageBar percent={m.utilizationPercent} state={m.state} label={`${m.name} utilization`} /></td>
                  <td className={TD}>{m.studentCount}</td>
                  <td className={TD}><StatusChip tone={STATE_TONE[m.state]}>{STATE_LABEL[m.state]}</StatusChip></td>
                  <td className={TD}><button type="button" className="text-xs text-brand-700 underline" aria-expanded={open === m.mentorUserId} onClick={() => setOpen(open === m.mentorUserId ? null : m.mentorUserId)}>{open === m.mentorUserId ? 'Hide' : canManage ? 'Edit and history' : 'History'}</button></td>
                </tr>
                {open === m.mentorUserId && (
                  <tr><td colSpan={8} className="space-y-3 bg-slate-50/60 px-3 py-3">
                    <p className="text-sm text-slate-700">{capacitySentence(m)}</p>
                    {canManage ? (
                      <div><span className={FIELD_LABEL}>Monthly hour limit</span><LimitEditor mentor={m} onError={setError} onSaved={() => { setError(null); onChanged(); }} /></div>
                    ) : <p className={`text-xs ${MUTED}`}>Only the Mentoring Head can change a limit.</p>}
                    <HistoryPanel mentor={m} />
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * The capacity part of the Mentor dashboard. A Mentor sees their own capacity; a person with staff access (the Mentoring Head, the CEO read
 * only) sees the team. Each call is authorised by the API again, so this choice never widens access.
 */
export function DashboardCapacity() {
  const { hasPermission } = usePermissions();
  const wantsTeam = hasPermission('mentoring.staff.read');
  const canManage = hasPermission('mentoring.staff.manage');
  const [own, setOwn] = React.useState<OwnCapacity | null>(null);
  const [team, setTeam] = React.useState<TeamCapacity | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    const request = wantsTeam ? mentoringApi('/mentoring/capacity/team').then((d: TeamCapacity) => { if (live) setTeam(d); }) : mentoringApi('/mentoring/capacity/me').then((d: OwnCapacity | null) => { if (live) setOwn(d); });
    request.then(() => { if (live) setError(null); }).catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The capacity could not be loaded.'); });
    return () => { live = false; };
  }, [wantsTeam, reload]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (wantsTeam && team) return <TeamCapacityView team={team} canManage={canManage} onChanged={() => setReload((n) => n + 1)} />;
  if (own) return <MentorCapacityCard capacity={own} />;
  return null;
}
