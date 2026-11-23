"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useAuth, usePermissions } from '@/components/providers/AuthProvider';
import { fmtDate, fmtDateTime } from '../hiring/constants';
import { Empty, ErrorNote, NoAccess, PageHeader, SkeletonRows } from '../hiring/_components/kit';
import { listSessions, listTrainees } from './actions';
import { ATTENDANCE, ATTENDANCE_VARIANT, TRAINEE_STAGE, candidateName } from './constants';
import {
  AddParticipantsDialog, CorrectAttemptDialog, ReadyForAssignmentDialog, RecordAttemptDialog, RescheduleSessionDialog, ScheduleSessionDialog,
} from './_components/TrainingDialogs';
import { cn } from '@/lib/utils';

const TABS = ['Sessions', 'Trainees'] as const;
type Dlg = null | { kind: string; session?: any; attempt?: any; trainee?: string; row?: any };
const label = (v?: string | null) => ATTENDANCE.find((a) => a.value === v)?.label ?? 'Not recorded';

/** Tutor ID once transferred; otherwise the Ready for Assignment action for completed trainees. */
function ReadyCell({ t, canMarkReady, onClick }: { t: any; canMarkReady: boolean; onClick: () => void }) {
  if (t.tutorId) {
    return <Link href="/tutor-hr/tutors" className="text-sm font-medium text-brand-700 hover:underline">Tutor {t.tutorId}</Link>;
  }
  if (t.stage !== 'COMPLETED') return null;
  return canMarkReady
    ? <Button size="sm" onClick={onClick}>Ready for Assignment</Button>
    : <span className="text-xs text-slate-500">Awaiting final verification</span>;
}

export default function TrainingPage() {
  const { effectiveUser } = useAuth();
  const { hasPermission } = usePermissions();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Sessions');
  const [sessions, setSessions] = useState<any[] | null>(null);
  const [trainees, setTrainees] = useState<any[] | null>(null);
  const [num, setNum] = useState('');
  const [status, setStatus] = useState('IN_PROGRESS');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);

  const canRead = hasPermission('tutor_training.read');
  const canSchedule = hasPermission('tutor_training.schedule');
  const canAdd = hasPermission('tutor_training.participants');
  const canRecord = hasPermission('tutor_training.record');
  const canOverride = hasPermission('tutor_training.override');
  const canMarkReady = hasPermission('tutor_hr.ready_for_assignment');
  const uid = effectiveUser?.id;

  const load = useCallback(async () => {
    if (!canRead) return;
    const [s, t] = await Promise.all([
      listSessions(num ? `sessionNumber=${num}` : ''),
      listTrainees(status ? `status=${status}` : ''),
    ]);
    if (s.ok) setSessions(s.data); else setError(s.message);
    if (t.ok) setTrainees(t.data); else setError(t.message);
  }, [canRead, num, status]);
  useEffect(() => { load(); }, [load]);

  if (!canRead) return <NoAccess what="Training" />;

  const close = () => setDlg(null);
  const dialog = { onClose: close, onDone: (m?: string) => { setNotice(m ?? null); load(); } };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Training"
        subtitle="Two compulsory onboarding sessions. A session is passed when the trainee attends and completes the task."
        actions={canSchedule && <Button onClick={() => setDlg({ kind: 'schedule' })}><Plus className="w-4 h-4 mr-1.5" />Schedule session</Button>}
      />
      {notice && <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</div>}
      <ErrorNote message={error} />

      <div role="tablist" aria-label="Training sections" className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn('px-4 h-10 text-sm font-medium border-b-2 -mb-px', tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Sessions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select aria-label="Session number" value={num} onChange={(e) => setNum(e.target.value)} className="w-44">
              <option value="">All sessions</option>
              <option value="1">Session 1</option>
              <option value="2">Session 2</option>
            </Select>
            <span className="text-xs text-slate-500">Showing the last 30 days and everything upcoming.</span>
          </div>
          {sessions === null ? <Card><SkeletonRows rows={4} /></Card> : sessions.length === 0 ? (
            <Card><Empty title="No sessions" hint={canSchedule ? 'Schedule Session 1 to start onboarding hired candidates.' : undefined} /></Card>
          ) : sessions.map((s) => {
            const recorded = s.recordedCount > 0;
            const conducts = s.conductorUserId === uid;
            const started = new Date(s.scheduledAt).getTime() <= Date.now() + 5 * 60_000;
            return (
              <Card key={s.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">Session {s.sessionNumber} · {fmtDateTime(s.scheduledAt)}</p>
                      <p className="text-xs text-slate-500">Conducted by {s.conductor.email} · {s.participantCount} trainee{s.participantCount === 1 ? '' : 's'} · {s.recordedCount} recorded</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canAdd && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'add', session: s })}>Add trainees</Button>}
                      {canSchedule && !recorded && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'reschedule', session: s })}>Reschedule</Button>}
                    </div>
                  </div>
                  {s.attempts.length === 0 ? <p className="text-sm text-slate-500">No trainees added yet.</p> : (
                    <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                      {s.attempts.map((a: any) => {
                        const who = candidateName(a.enrolment.tutorLead);
                        return (
                          <li key={a.id} className="p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <Link href={`/tutor-hr/hiring/candidates/${a.enrolment.tutorLead.id}`} className="font-medium text-slate-900 hover:text-brand-700">{who}</Link>
                              <span className="text-slate-500"> · {a.enrolment.tutorLead.phone}</span>
                              {a.remarks && <p className="text-slate-600">{a.remarks}</p>}
                              {a.corrections?.length > 0 && <p className="text-xs text-slate-500">Corrected {a.corrections.length}× · last by {a.corrections[0].correctedBy.email}: {a.corrections[0].reason}</p>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {a.attendance ? (
                                <>
                                  <Badge variant={ATTENDANCE_VARIANT[a.attendance]}>{label(a.attendance)}</Badge>
                                  <Badge variant={a.taskCompleted ? 'success' : 'default'}>{a.taskCompleted ? 'Task completed' : 'Task not completed'}</Badge>
                                  {canOverride && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'correct', attempt: a, trainee: who })}>Correct</Button>}
                                </>
                              ) : canRecord && (conducts || canOverride) && started ? (
                                <Button size="sm" onClick={() => setDlg({ kind: 'record', attempt: a, trainee: who, session: s })}>Record attendance</Button>
                              ) : <span className="text-xs text-slate-500">Not recorded</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {s.history?.length > 0 && (
                    <details className="text-sm text-slate-600">
                      <summary className="cursor-pointer">Reschedule history ({s.history.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {s.history.map((h: any) => (
                          <li key={h.id}>{fmtDateTime(h.changedAt)}: {fmtDateTime(h.previousScheduledAt)} → {fmtDateTime(h.newScheduledAt)} by {h.changedBy.email} ({h.reason})</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'Trainees' && (
        <div className="space-y-4">
          <Select aria-label="Progress" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="">All</option>
          </Select>
          <Card>
            {trainees === null ? <SkeletonRows rows={5} /> : trainees.length === 0 ? (
              <Empty title="No trainees" hint="Candidates appear here when they are marked Hired." />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trainee</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Session 1 passed</TableHead>
                        <TableHead>Session 2 passed</TableHead>
                        <TableHead>Repeats</TableHead>
                        <TableHead>Hired</TableHead>
                        <TableHead><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trainees.map((t) => (
                        <TableRow key={t.enrolmentId}>
                          <TableCell>
                            <Link href={`/tutor-hr/hiring/candidates/${t.candidate.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{t.candidate.name}</Link>
                            <p className="text-xs text-slate-500">{t.candidate.businessId} · {t.candidate.phone}</p>
                          </TableCell>
                          <TableCell><Badge variant={TRAINEE_STAGE[t.stage]?.variant ?? 'default'}>{TRAINEE_STAGE[t.stage]?.label ?? t.stage}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(t.session1PassedAt)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(t.session2PassedAt)}</TableCell>
                          <TableCell className="tabular-nums">{t.repeats.session1 + t.repeats.session2 || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap text-slate-600">{fmtDate(t.enrolledAt)}</TableCell>
                          <TableCell className="text-right"><ReadyCell t={t} canMarkReady={canMarkReady} onClick={() => setDlg({ kind: 'ready', row: t })} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="md:hidden divide-y divide-slate-100">
                  {trainees.map((t) => (
                    <li key={t.enrolmentId} className="p-4">
                      <Link href={`/tutor-hr/hiring/candidates/${t.candidate.id}`} className="font-semibold text-slate-900">{t.candidate.name}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge variant={TRAINEE_STAGE[t.stage]?.variant ?? 'default'}>{TRAINEE_STAGE[t.stage]?.label ?? t.stage}</Badge>
                        <span>{t.candidate.phone}</span>
                      </div>
                      <div className="mt-2"><ReadyCell t={t} canMarkReady={canMarkReady} onClick={() => setDlg({ kind: 'ready', row: t })} /></div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      )}

      <ScheduleSessionDialog isOpen={dlg?.kind === 'schedule'} {...dialog} />
      {dlg?.session && dlg.kind === 'reschedule' && <RescheduleSessionDialog session={dlg.session} isOpen {...dialog} />}
      {dlg?.session && dlg.kind === 'add' && <AddParticipantsDialog session={dlg.session} isOpen {...dialog} />}
      {dlg?.attempt && dlg.kind === 'record' && (
        <RecordAttemptDialog attempt={dlg.attempt} trainee={dlg.trainee ?? ''} onBehalf={dlg.session?.conductorUserId !== uid} isOpen {...dialog} />
      )}
      {dlg?.row && dlg.kind === 'ready' && <ReadyForAssignmentDialog trainee={dlg.row} isOpen {...dialog} />}
      {dlg?.attempt && dlg.kind === 'correct' && <CorrectAttemptDialog attempt={dlg.attempt} trainee={dlg.trainee ?? ''} isOpen {...dialog} />}
    </div>
  );
}
