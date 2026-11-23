"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuth, usePermissions } from '@/components/providers/AuthProvider';
import { getCandidate, getCandidateDemos } from '../../actions';
import { getTrainee } from '../../../training/actions';
import { ATTENDANCE, ATTENDANCE_VARIANT, TRAINEE_STAGE } from '../../../training/constants';
import {
  CALL_STATUSES, DECISIONS, DEMO_STATUS_LABEL, LEAD_STATUSES, MANUAL_STAGES, STAGES, WEEKDAYS, fmtDate, fmtDateTime, labelOf,
} from '../../constants';
import {
  AttendanceDialog, BookDemoDialog, CallDialog, CvDialog, DecisionDialog, DetailsDialog,
  EnquiryDialog, EvaluationDialog, LeadStatusDialog, ReassignDialog, RescheduleDialog, StageDialog,
} from '../../_components/CandidateDialogs';
import { DecisionBadge, Empty, ErrorNote, LeadStatusBadge, SkeletonRows, SlaBadge, StageBadge } from '../../_components/kit';
import { cn } from '@/lib/utils';

type Dlg = null | { kind: string; booking?: any };
const TABS = ['Overview', 'Demos', 'Calls', 'Training', 'History'] as const;
const actionLabel = (a: string) => a.replace(/^TUTOR_/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-slate-500">{k}</dt>
      <dd className="col-span-2 text-slate-900 break-words">{v || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { effectiveUser } = useAuth();
  const { hasPermission } = usePermissions();
  const [lead, setLead] = useState<any>(null);
  const [demos, setDemos] = useState<any[]>([]);
  const [training, setTraining] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const [dlg, setDlg] = useState<Dlg>(null);

  const load = useCallback(async () => {
    const [a, b, t] = await Promise.all([getCandidate(id), getCandidateDemos(id), getTrainee(id)]);
    // Training is optional context: staff without tutor_training.read simply see no Training data.
    setTraining(t.ok ? t.data : null);
    if (a.ok) { setLead(a.data); setError(null); } else setError(a.message);
    if (b.ok) setDemos(b.data);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const close = () => setDlg(null);
  const done = (msg?: string) => { setNotice(msg ?? null); load(); };
  const dialog = { onClose: close, onDone: done };

  if (!lead) {
    return error ? <ErrorNote message={error} /> : <Card><SkeletonRows rows={6} /></Card>;
  }

  const canUpdate = hasPermission('tutor_lead.update');
  const canStage = hasPermission('tutor_lead.stage.update');
  const processing = (lead.leadStatus ?? 'PROCESSING') === 'PROCESSING';
  const closed = !processing || ['REJECTED', 'NOT_INTERESTED', 'HIRED'].includes(lead.decision);
  const stageIdx = STAGES.findIndex((s) => s.value === lead.hiringStage);
  const manualIdx = MANUAL_STAGES.findIndex((s) => s.value === lead.hiringStage);
  const nextStage = manualIdx >= 0 ? MANUAL_STAGES[manualIdx + 1] : undefined;
  const active = demos.find((d) => d.status === 'BOOKED');
  const uid = effectiveUser?.id;
  const canOverride = hasPermission('tutor_hiring.override');
  const canDecide = canStage && processing && lead.hiringStage === 'LIVE_DEMO_INTERVIEW' && lead.decision !== 'HIRED';
  const hhmm = (t: string) => String(t).slice(11, 16);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/tutor-hr/hiring/candidates" aria-label="Back to candidates" className="mt-1.5 text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{lead.name ?? 'Unnamed lead'}</h1>
            <StageBadge stage={lead.hiringStage} />
            <LeadStatusBadge status={lead.leadStatus} />
            <DecisionBadge decision={lead.decision} />
          </div>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" aria-hidden />{lead.phone} · {lead.businessId}</p>
        </div>
      </div>

      {/* Stage progress */}
      <ol className="grid grid-cols-2 sm:grid-cols-5 gap-2" aria-label="Hiring stages">
        {STAGES.map((s, i) => (
          <li key={s.value} aria-current={i === stageIdx ? 'step' : undefined}
            className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              i < stageIdx ? 'border-brand-200 bg-brand-50 text-brand-800' : i === stageIdx ? 'border-brand-600 bg-white font-semibold text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-400')}>
            {i < stageIdx ? <Check className="w-4 h-4" aria-hidden /> : <span className="w-4 text-center text-xs">{i + 1}</span>}
            {s.label}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {canUpdate && <Button variant="outline" onClick={() => setDlg({ kind: 'call' })}>Log call</Button>}
        {hasPermission('tutor_lead.create') && <Button variant="outline" onClick={() => setDlg({ kind: 'enquiry' })}>Add enquiry</Button>}
        {canUpdate && <Button variant="outline" onClick={() => setDlg({ kind: 'details' })}>Edit details</Button>}
        {canUpdate && stageIdx >= 2 && <Button variant="outline" onClick={() => setDlg({ kind: 'cv' })}>{lead.cvReceivedAt ? 'Edit CV received time' : 'Record CV received'}</Button>}
        {canStage && nextStage && !closed && <Button onClick={() => setDlg({ kind: 'stage' })}>Complete {labelOf(STAGES, lead.hiringStage)}</Button>}
        {canDecide && <Button variant="secondary" onClick={() => setDlg({ kind: 'decision' })}>Set decision</Button>}
        {canStage && <Button variant="outline" onClick={() => setDlg({ kind: 'leadStatus' })}>Change lead status</Button>}
      </div>
      {!processing && (
        <div role="status" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Lead status is {labelOf(LEAD_STATUSES, lead.leadStatus)}{lead.leadStatusRemarks ? `: ${lead.leadStatusRemarks}` : ''}. Set it back to Processing to continue this candidate.
        </div>
      )}
      {training?.tutorLead?.tutorProfile?.tutorCode ? (
        <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          Ready for Assignment. Tutor ID {training.tutorLead.tutorProfile.tutorCode}; this tutor is now in <Link href="/tutor-hr/tutors" className="underline">Tutors</Link>.
        </div>
      ) : lead.hiringStage === 'TRAINING' && (
        <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          Hired{lead.trainingStartedAt ? ` on ${fmtDate(lead.trainingStartedAt)}` : ''}. The candidate has moved to Training.
        </div>
      )}

      {notice && <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</div>}
      <ErrorNote message={error} />

      <div role="tablist" aria-label="Candidate sections" className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn('px-4 h-10 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900')}>
            {t}{t === 'Calls' ? ` (${lead.calls.length})` : t === 'Demos' ? ` (${demos.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Details shared</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y divide-slate-100">
                <Row k="Mother tongue" v={lead.motherTongue?.name} />
                <Row k="Subjects" v={lead.subjects.map((x: any) => x.subject?.name).join(', ')} />
                <Row k="Grades" v={lead.grades.map((x: any) => x.grade?.name).join(', ')} />
                <Row k="Curricula" v={lead.curricula.map((x: any) => x.curriculum?.name).join(', ')} />
                <Row k="Languages" v={lead.languages.map((x: any) => x.language?.name).join(', ')} />
                <Row k="Online experience" v={lead.onlineTeachingExperience != null ? `${lead.onlineTeachingExperience} yrs` : ''} />
                <Row k="Offline experience" v={lead.offlineTeachingExperience != null ? `${lead.offlineTeachingExperience} yrs` : ''} />
                <Row k="Expected hourly rate" v={lead.expectedHourlyRate != null ? String(lead.expectedHourlyRate) : ''} />
                <Row k="Available teaching time" v={(lead.availability ?? []).map((a: any) => `${WEEKDAYS[a.dayOfWeek]} ${hhmm(a.startTime)}-${hhmm(a.endTime)}`).join(', ')} />
                <Row k="Email" v={lead.email} />
                <Row k="Additional phone" v={lead.additionalPhone} />
                <Row k="Response received" v={lead.detailsRespondedAt ? fmtDateTime(lead.detailsRespondedAt) : ''} />
                <Row k="Description" v={lead.detailsDescription} />
                <Row k="Remarks" v={lead.remarks} />
              </dl>
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>CV</CardTitle></CardHeader>
              <CardContent><Row k="Received on" v={lead.cvReceivedAt ? fmtDateTime(lead.cvReceivedAt) : stageIdx >= 2 ? 'Not recorded yet' : 'Available from the CV stage'} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Enquiries</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y divide-slate-100">
                  {lead.enquiries.map((e: any) => (
                    <li key={e.id} className="py-2 text-sm">
                      <div className="flex justify-between gap-2"><span className="font-medium text-slate-900">{e.source?.name}</span><span className="text-slate-500">{fmtDate(e.enquiryDate)}</span></div>
                      {e.notes && <p className="text-slate-600">{e.notes}</p>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'Demos' && (
        <div className="space-y-4">
          {canUpdate && lead.hiringStage === 'LIVE_DEMO_INTERVIEW' && !active && !closed && (
            <Button onClick={() => setDlg({ kind: 'book' })}>Book demo / interview</Button>
          )}
          {lead.hiringStage !== 'LIVE_DEMO_INTERVIEW' && <p className="text-sm text-slate-500">Demos can be booked once the candidate reaches the Live Demo & Interview stage.</p>}
          {demos.length === 0 ? <Card><Empty title="No demos yet" /></Card> : demos.map((d) => {
            const isConductor = d.assignedToUserId === uid;
            const mayAct = isConductor || canOverride;
            return (
              <Card key={d.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{fmtDateTime(d.scheduledAt)}</p>
                      <p className="text-xs text-slate-500">Assigned to {d.assignedTo.email} · booked by {d.bookedBy.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={d.status === 'ATTENDED' ? 'success' : d.status === 'BOOKED' ? 'info' : 'default'}>{DEMO_STATUS_LABEL[d.status] ?? d.status}</Badge>
                      <SlaBadge state={d.evaluationSla?.state} />
                    </div>
                  </div>
                  {d.rescheduleReason && <p className="text-sm text-slate-600">Reschedule reason: {d.rescheduleReason}</p>}
                  {d.status === 'ATTENDED' && (
                    <p className="text-sm text-slate-600">Conducted by {d.assignedTo.email} · completed {fmtDateTime(d.completedAt)}{d.evaluationSla?.dueAt && !d.evaluation ? ` · evaluation due ${fmtDateTime(d.evaluationSla.dueAt)}` : ''}</p>
                  )}
                  {d.evaluation && (
                    <div className="rounded-md bg-slate-50 p-3 text-sm space-y-1">
                      <p><span className="text-slate-500">Teaching methods:</span> {d.evaluation.teachingMethods}</p>
                      <p><span className="text-slate-500">Technical skills:</span> {d.evaluation.technicalSkills}</p>
                      <p><span className="text-slate-500">English rating:</span> {d.evaluation.englishRating}/5{d.evaluationSla?.evaluatedLate ? ' · submitted late' : ''}</p>
                      {d.evaluation.remarks && <p><span className="text-slate-500">Remarks:</span> {d.evaluation.remarks}</p>}
                    </div>
                  )}
                  {d.assignmentHistory?.length > 1 && (
                    <details className="text-sm text-slate-600">
                      <summary className="cursor-pointer">Assignment history ({d.assignmentHistory.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {d.assignmentHistory.map((h: any) => (
                          <li key={h.id}>{fmtDateTime(h.changedAt)}: {h.from?.email ?? 'unassigned'} → {h.to.email} by {h.changedBy.email}{h.reason ? ` (${h.reason})` : ''}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {d.status === 'BOOKED' && canUpdate && (
                      <>
                        {mayAct && <Button size="sm" onClick={() => setDlg({ kind: 'attendance', booking: d })}>Record outcome</Button>}
                        <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'reschedule', booking: d })}>Reschedule</Button>
                      </>
                    )}
                    {d.status === 'BOOKED' && hasPermission('tutor_hiring.reassign') && (
                      <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'reassign', booking: d })}>Reassign</Button>
                    )}
                    {d.status === 'ATTENDED' && !d.evaluation && (
                      mayAct
                        ? <Button size="sm" onClick={() => setDlg({ kind: 'evaluate', booking: d })}>{isConductor ? 'Submit evaluation' : 'Submit evaluation (override)'}</Button>
                        : <span className="text-xs text-slate-500 self-center">Only {d.assignedTo.email} can submit this evaluation.</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'Training' && (
        <Card>
          {!training?.enrolled ? (
            <Empty title="Not in Training" hint={training ? 'Candidates enter Training when they are marked Hired.' : 'Training details are not available to your role.'} />
          ) : (
            <CardContent className="pt-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={TRAINEE_STAGE[training.stage]?.variant ?? 'default'}>{TRAINEE_STAGE[training.stage]?.label ?? training.stage}</Badge>
                <span className="text-slate-600">Session 1 passed: {fmtDate(training.session1PassedAt)} · Session 2 passed: {fmtDate(training.session2PassedAt)}</span>
                <Link href="/tutor-hr/training" className="text-brand-700 hover:underline">Open Training</Link>
              </div>
              {training.attempts.length === 0 ? <p className="text-sm text-slate-500">Not added to a session yet.</p> : (
                <ol className="divide-y divide-slate-100 rounded-md border border-slate-100">
                  {training.attempts.map((a: any, i: number) => (
                    <li key={a.id} className="p-3 text-sm space-y-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium text-slate-900">Attempt {i + 1} · Session {a.sessionNumber} · {fmtDateTime(a.session.scheduledAt)}</span>
                        {a.attendance ? (
                          <span className="flex gap-2">
                            <Badge variant={ATTENDANCE_VARIANT[a.attendance]}>{ATTENDANCE.find((x) => x.value === a.attendance)?.label}</Badge>
                            <Badge variant={a.taskCompleted ? 'success' : 'default'}>{a.taskCompleted ? 'Task completed' : 'Task not completed'}</Badge>
                          </span>
                        ) : <span className="text-xs text-slate-500">Not recorded</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        Conducted by {a.session.conductor.email} · added by {a.addedBy.email}
                        {a.recordedBy ? ` · recorded by ${a.recordedBy.email} on ${fmtDateTime(a.recordedAt)}` : ''}
                      </p>
                      {a.remarks && <p className="text-slate-600">{a.remarks}</p>}
                      {a.corrections.map((c: any) => (
                        <p key={c.id} className="text-xs text-amber-800">
                          Corrected {fmtDateTime(c.correctedAt)} by {c.correctedBy.email}: was {ATTENDANCE.find((x) => x.value === c.previousAttendance)?.label}, task {c.previousTaskCompleted ? 'completed' : 'not completed'} ({c.reason})
                        </p>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {tab === 'Calls' && (
        <Card>
          {lead.calls.length === 0 ? <Empty title="No calls logged" /> : (
            <ul className="divide-y divide-slate-100">
              {lead.calls.map((c: any) => (
                <li key={c.id} className="p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-slate-900">{labelOf(CALL_STATUSES, c.status)}</span>
                    <span className="text-slate-500">{fmtDateTime(c.calledAt)} · {c.caller?.email}</span>
                  </div>
                  {c.remark && <p className="text-slate-600 mt-1">{c.remark}</p>}
                  {c.followUpAt && <p className="text-xs text-amber-700 mt-1">Follow-up: {fmtDateTime(c.followUpAt)}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'History' && (
        <div className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Lead status history</CardTitle></CardHeader>
            {(lead.statusHistory ?? []).length === 0 ? <Empty title="Processing since registration" /> : (
              <ul className="divide-y divide-slate-100">
                {lead.statusHistory.map((h: any) => (
                  <li key={h.id} className="p-4 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-slate-900">{labelOf(LEAD_STATUSES, h.previousStatus)} → {labelOf(LEAD_STATUSES, h.newStatus)}</span>
                      <span className="text-slate-500">{fmtDateTime(h.changedAt)} · {h.changedBy?.email}</span>
                    </div>
                    {h.remarks && <p className="text-slate-600 mt-0.5">{h.remarks}</p>}
                    {h.source === 'DECISION' && <p className="text-xs text-slate-500 mt-0.5">Set by the candidate decision</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader><CardTitle>Decision history</CardTitle></CardHeader>
            {(lead.decisionHistory ?? []).length === 0 ? <Empty title="No decisions yet" /> : (
              <ul className="divide-y divide-slate-100">
                {lead.decisionHistory.map((h: any) => (
                  <li key={h.id} className="p-4 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-slate-900">{h.previousDecision ? `${labelOf(DECISIONS, h.previousDecision)} → ` : ''}{labelOf(DECISIONS, h.newDecision)}</span>
                      <span className="text-slate-500">{fmtDateTime(h.changedAt)} · {h.changedBy?.email}</span>
                    </div>
                    {h.remarks && <p className="text-slate-600 mt-0.5">{h.remarks}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card>
          {lead.auditTimeline.length === 0 ? <Empty title="No history yet" /> : (
            <ol className="divide-y divide-slate-100">
              {lead.auditTimeline.map((a: any) => (
                <li key={a.id} className="p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-slate-900">{actionLabel(a.action)}</span>
                    <span className="text-slate-500">{fmtDateTime(a.timestamp)}</span>
                  </div>
                  {a.reason && <p className="text-slate-600 mt-0.5">{a.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
        </div>
      )}

      <LeadStatusDialog id={id} current={lead.leadStatus ?? 'PROCESSING'} isOpen={dlg?.kind === 'leadStatus'} {...dialog} />
      <CallDialog id={id} isOpen={dlg?.kind === 'call'} {...dialog} />
      <EnquiryDialog id={id} isOpen={dlg?.kind === 'enquiry'} {...dialog} />
      <DetailsDialog lead={lead} isOpen={dlg?.kind === 'details'} {...dialog} />
      <CvDialog id={id} current={lead.cvReceivedAt} isOpen={dlg?.kind === 'cv'} {...dialog} />
      <StageDialog id={id} current={lead.hiringStage} isOpen={dlg?.kind === 'stage'} {...dialog} />
      <DecisionDialog id={id} stage={lead.hiringStage} current={lead.decision} isOpen={dlg?.kind === 'decision'} {...dialog} />
      <BookDemoDialog id={id} isOpen={dlg?.kind === 'book'} {...dialog} />
      {dlg?.booking && (
        <>
          <RescheduleDialog booking={dlg.booking} isOpen={dlg.kind === 'reschedule'} {...dialog} />
          <ReassignDialog booking={dlg.booking} isOpen={dlg.kind === 'reassign'} {...dialog} />
          <AttendanceDialog booking={dlg.booking} currentUserId={uid} isOpen={dlg.kind === 'attendance'} {...dialog} />
          <EvaluationDialog booking={dlg.booking} isOpen={dlg.kind === 'evaluate'} {...dialog} />
        </>
      )}
    </div>
  );
}
