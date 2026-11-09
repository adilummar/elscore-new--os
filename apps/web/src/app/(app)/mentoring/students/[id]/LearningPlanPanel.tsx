"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { mentoringApi } from '../../mentoring-client';
import {
  Draft, HISTORY_LABELS, LearningPlanData, LearningPlanSubject, OVERALL_LABELS, SUBJECT_LABELS, draftOf, formatDate, formatDateTime, isDirty, missingFor, payloadOf,
} from '../../learning-plan-view';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-600';
const OVERALL_TONE: Record<LearningPlanData['status'], 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  NOT_STARTED: 'default', DRAFT: 'warning', PENDING_REVIEW_DATE: 'info', READY_FOR_REVIEW: 'info', APPROVED: 'success',
};
const SUBJECT_TONE: Record<LearningPlanSubject['status'], 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  NOT_STARTED: 'default', DRAFT: 'warning', PENDING_END_DATE: 'info', COMPLETE: 'success',
};

// ─── The summary at the top ──────────────────────────────────────────────────────────────────────────────────────
export function PlanSummary({ data }: { data: LearningPlanData }) {
  const s = data.summary;
  const cards: Array<[string, string]> = [
    ['Enrolled subjects', String(s.enrolledSubjects)],
    ['Subject plans complete', `${s.completedSubjects} of ${s.enrolledSubjects}`],
    ['Overall start date', s.overallStart ? formatDate(s.overallStart) : 'Not set'],
    ['Next monthly review meeting', s.nextReviewMeeting ? formatDate(s.nextReviewMeeting) : 'Pending'],
    ['Overall end date', s.endsOn ? formatDate(s.endsOn) : 'Pending'],
  ];
  return (
    <div className="space-y-2" data-testid="plan-summary">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-slate-900">{data.student.name}, learning plan</h2>
        <Badge variant={OVERALL_TONE[data.status]} data-testid="plan-status">{OVERALL_LABELS[data.status]}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-sm font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {data.pendingMessage && (
        <div role="status" className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" data-testid="review-date-pending">
          <p className="font-medium">{data.pendingMessage}</p>
          <p>{data.pendingExplanation}</p>
        </div>
      )}
    </div>
  );
}

// ─── One subject ─────────────────────────────────────────────────────────────────────────────────────────────────
interface CardProps {
  subject: LearningPlanSubject;
  meetingDate: string | null;
  draft: Draft;
  canEdit: boolean;
  needsReason: boolean;
  reason: string;
  busy?: boolean;
  error?: string | null;
  onChange: (next: Draft) => void;
  onReason: (reason: string) => void;
  onSave: () => void;
}

export function SubjectPlanCard({ subject, meetingDate, draft, canEdit, needsReason, reason, busy = false, error = null, onChange, onReason, onSave }: CardProps) {
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...draft, [k]: e.target.value });
  const dirty = isDirty(draft, subject, meetingDate);
  const missing = missingFor(draft);
  const id = (k: string) => `plan-${subject.subjectId}-${k}`;
  return (
    <section aria-label={`${subject.subjectName} learning plan`} className="rounded-md border border-slate-200 bg-white p-3" data-testid="subject-plan" data-subject={subject.subjectId} data-status={subject.status}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-slate-900">{subject.subjectName}<span className="ml-2 font-normal text-slate-500">{subject.gradeName}</span></h3>
        <Badge variant={SUBJECT_TONE[subject.status]}>{SUBJECT_LABELS[subject.status]}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2" htmlFor={id('description')}>
          <span className="mb-1 block font-medium text-slate-700">Learning plan description <span className="text-red-600">required</span></span>
          <textarea id={id('description')} rows={2} className={AREA} value={draft.description} onChange={set('description')} disabled={!canEdit} placeholder={`What this plan is for in ${subject.subjectName}`} />
        </label>
        <label className="block text-sm" htmlFor={id('objectives')}>
          <span className="mb-1 block font-medium text-slate-700">Learning objectives</span>
          <textarea id={id('objectives')} rows={3} className={AREA} value={draft.objectives} onChange={set('objectives')} disabled={!canEdit} />
        </label>
        <label className="block text-sm" htmlFor={id('topics')}>
          <span className="mb-1 block font-medium text-slate-700">Topics or syllabus to cover</span>
          <textarea id={id('topics')} rows={3} className={AREA} value={draft.topics} onChange={set('topics')} disabled={!canEdit} />
        </label>
        <label className="block text-sm md:col-span-2" htmlFor={id('outcomes')}>
          <span className="mb-1 block font-medium text-slate-700">Expected learning outcomes</span>
          <textarea id={id('outcomes')} rows={2} className={AREA} value={draft.outcomes} onChange={set('outcomes')} disabled={!canEdit} />
        </label>
        <div className="text-sm">
          <label htmlFor={id('start')} className="mb-1 block font-medium text-slate-700">Start date <span className="text-red-600">required</span></label>
          <Input id={id('start')} type="date" value={draft.startsOn} min={subject.scheduleStart ?? undefined} max={meetingDate ?? undefined} onChange={set('startsOn')} disabled={!canEdit} />
          <p className="mt-1 text-xs text-slate-500">
            {!subject.plan && subject.defaultStart ? `Offered from the planned first class on ${formatDate(subject.defaultStart)}. ` : ''}
            {subject.scheduleStart ? `Classes start on ${formatDate(subject.scheduleStart)}.` : 'No class start date is saved in the schedule.'}
          </p>
        </div>
        <div className="text-sm">
          <label htmlFor={id('end')} className="mb-1 block font-medium text-slate-700">End date</label>
          {meetingDate ? (
            <>
              <Input id={id('end')} type="date" value={draft.endsOn} min={draft.startsOn || undefined} max={meetingDate} onChange={set('endsOn')} disabled={!canEdit} />
              <p className="mt-1 text-xs text-slate-500">The monthly review meeting is on {formatDate(meetingDate)}. A plan can end earlier, never later.</p>
            </>
          ) : (
            <>
              <p id={id('end')} className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-slate-600" data-testid="end-pending">Pending</p>
              <p className="mt-1 text-xs text-slate-500">Set when the monthly review meeting is scheduled.</p>
            </>
          )}
        </div>
      </div>
      {needsReason && canEdit && (
        <label className="mt-3 block text-sm" htmlFor={id('reason')}>
          <span className="mb-1 block font-medium text-slate-700">Why is this approved plan changing? <span className="text-red-600">required</span></span>
          <textarea id={id('reason')} rows={2} className={AREA} value={reason} onChange={(e) => onReason(e.target.value)} />
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canEdit && <Button type="button" size="sm" isLoading={busy} disabled={busy || !dirty || missing.length > 0 || (needsReason && !reason.trim())} onClick={onSave}>Save {subject.subjectName} plan</Button>}
        {canEdit && missing.length > 0 && <p className="text-xs text-slate-500">Add {missing.join(' and ')} to save.</p>}
        {subject.plan && <p className="ml-auto text-xs text-slate-500">Created by {subject.createdBy ?? 'a user'}, last updated by {subject.updatedBy ?? subject.createdBy ?? 'a user'}{subject.updatedAt ? ` on ${formatDateTime(subject.updatedAt)}` : ''}</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function PlanHistory({ data }: { data: LearningPlanData }) {
  return (
    <section aria-label="Learning plan history" className="rounded-md border border-slate-200 bg-white p-3" data-testid="plan-history">
      <h3 className="mb-1 text-sm font-semibold text-slate-900">History</h3>
      {data.history.length === 0 ? <p className="text-sm text-slate-500">Nothing has been saved yet.</p> : (
        <ol className="space-y-1 text-sm">
          {data.history.map((h) => (
            <li key={h.version} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{HISTORY_LABELS[h.kind] ?? h.kind}</span>
              <span className="text-slate-600">version {h.version}{h.changedBy ? `, ${h.changedBy}` : ''}, {formatDateTime(h.at)}</span>
              {h.reason && <span className="w-full text-slate-600">{h.reason}</span>}
            </li>
          ))}
        </ol>
      )}
      {data.approval.by && <p className="mt-2 text-xs text-slate-600">Approved by {data.approval.by}{data.approval.at ? ` on ${formatDateTime(data.approval.at)}` : ''}.</p>}
    </section>
  );
}

// ─── The page section ────────────────────────────────────────────────────────────────────────────────────────────
/** Stage 5: a separate learning plan for every subject, all ending on the monthly review meeting date, above the checklist. */
export function LearningPlanPanel({ activationId }: { activationId: string }) {
  const [data, setData] = React.useState<LearningPlanData | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string | null>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const base = `/mentoring/students/${activationId}/learning-plan`;

  const load = React.useCallback(async () => {
    try {
      const next: LearningPlanData = await mentoringApi(base);
      setData(next);
      // Keep what is being typed; fill the subjects that have nothing typed yet.
      setDrafts((cur) => Object.fromEntries(next.subjects.map((s) => [s.subjectId, cur[s.subjectId] && isDirty(cur[s.subjectId], s, next.meeting?.date ?? null) ? cur[s.subjectId] : draftOf(s, next.meeting?.date ?? null)])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The learning plan could not be loaded.');
    }
  }, [base]);
  React.useEffect(() => { void load(); }, [load]);

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setErrors((cur) => ({ ...cur, [key]: null }));
    try {
      await run();
      setReasons((cur) => ({ ...cur, [key]: '' }));
      setDrafts({});
      await load();
    } catch (e) {
      setErrors((cur) => ({ ...cur, [key]: e instanceof Error && e.message ? e.message : 'That could not be saved.' }));
    }
    setBusy(null);
  };

  if (error && !data) return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading the learning plan</p>;
  const meetingDate = data.meeting?.date ?? null;
  return (
    <section aria-label="Individual learning plan" className="space-y-3" data-testid="stage-learning-plan">
      <PlanSummary data={data} />
      {!data.canEdit && <p className="text-xs text-slate-500">{data.stageStatus === 'NOT_STARTED' ? 'Start this stage to write the plans. Until then they are read-only.' : 'Only the assigned Mentor can change these plans while the stage is open.'}</p>}
      {data.subjects.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">No subjects are saved in the schedule yet. Schedule the subjects in the Meeting with Parents stage first.</p>
      ) : (
        <div className="space-y-3">
          {data.subjects.map((s) => (
            <SubjectPlanCard
              key={s.subjectId}
              subject={s}
              meetingDate={meetingDate}
              draft={drafts[s.subjectId] ?? draftOf(s, meetingDate)}
              canEdit={data.canEdit}
              needsReason={data.planStatus === 'APPROVED'}
              reason={reasons[s.subjectId] ?? ''}
              busy={busy === s.subjectId}
              error={errors[s.subjectId] ?? null}
              onChange={(next) => setDrafts((cur) => ({ ...cur, [s.subjectId]: next }))}
              onReason={(r) => setReasons((cur) => ({ ...cur, [s.subjectId]: r }))}
              onSave={() => act(s.subjectId, () => mentoringApi(`${base}/subjects/${s.subjectId}`, 'PUT', payloadOf(drafts[s.subjectId] ?? draftOf(s, meetingDate), meetingDate, reasons[s.subjectId] ?? '')))}
            />
          ))}
        </div>
      )}
      {data.problems.length > 0 && data.status !== 'NOT_STARTED' && (
        <ul role="list" aria-label="What is still needed" className="space-y-0.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="plan-problems">
          {data.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {data.canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {data.planStatus === 'DRAFT' && <Button type="button" size="sm" isLoading={busy === 'ready'} disabled={busy !== null || data.problems.length > 0} onClick={() => act('ready', () => mentoringApi(`${base}/ready`, 'POST', {}))}>Mark ready for review</Button>}
          {data.planStatus === 'READY_FOR_REVIEW' && <Button type="button" size="sm" isLoading={busy === 'approve'} disabled={busy !== null} onClick={() => act('approve', () => mentoringApi(`${base}/approve`, 'POST', {}))}>Approve plan</Button>}
          {(errors.ready || errors.approve) && <p role="alert" className="text-xs font-medium text-red-600">{errors.ready ?? errors.approve}</p>}
        </div>
      )}
      <PlanHistory data={data} />
    </section>
  );
}
