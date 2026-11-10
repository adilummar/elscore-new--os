"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../../mentoring-client';
import {
  ActualDraft, EXPECTATION_FIELDS, GoalDraft, MEETING_TONE, NEXT_PLAN_KIND_CHOICES, NextPlanDraft, PARTICIPATION_CHOICES, POST_MEETING_FIELDS, REMARK_FIELDS, RESULT_CHOICES, ReviewData, ReviewExam, ReviewGoal, ReviewSubject,
  actualProblems, dayAfter, draftOfActual, draftOfGoal, draftOfNextPlan, emptyGoalDraft, goalProblems, nextPlanProblems, payloadOfActual, payloadOfGoal, percentLabel, resultLabel, tallyText, timeLabel,
} from '../../review-view';
import { dayLabel, longDayLabel } from '../../timetable-view';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const when = (iso: string) => `${dayLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
const Section = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
  <section aria-label={title} className="space-y-2 rounded-md border border-slate-200 bg-white p-3" data-testid="review-section">
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    {hint && <p className="text-xs text-slate-600">{hint}</p>}
    {children}
  </section>
);

export type Call = (label: string, path: string, method: 'POST' | 'PUT', body: unknown, done: string, after?: () => void) => void;

// ─── The dashboard ──────────────────────────────────────────────────────────────────────────────────────────────
export function ReviewDashboard({ d }: { d: ReviewData }) {
  const m = d.meeting;
  return (
    <section aria-label="Monthly review dashboard" className="rounded-md border border-slate-200 bg-white p-3" data-testid="review-dashboard">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-slate-900">Monthly review</h3>
        <Badge variant={MEETING_TONE[m?.state ?? 'NOT_SCHEDULED']} data-testid="meeting-state">{m?.stateLabel ?? 'Not scheduled'}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {([
          ['Learning plan start', d.period.start ? longDayLabel(d.period.start) : 'Not set'], ['Learning plan end', d.period.end ? longDayLabel(d.period.end) : 'Monthly review meeting date pending'],
          ['Review meeting', m ? `${longDayLabel(m.date)}, ${timeLabel(m.startMinute, m.endMinute)}` : 'Not scheduled'], ['Assigned Mentor', d.mentorName ?? 'Not assigned'],
          ['Parent meeting', m ? m.stateLabel : 'Not scheduled'], ['Exam performance', d.exams.items.length ? `${d.exams.items.length} ${d.exams.items.length === 1 ? 'exam' : 'exams'} in this period` : 'No exams in this period'],
        ] as Array<[string, string]>).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>)}
        {m && m.date !== m.originalDate && <div><dt className="text-xs text-slate-500">First scheduled date</dt><dd className="text-slate-900">{longDayLabel(m.originalDate)}</dd></div>}
      </dl>
      {d.subjects.length > 0 && (
        <table className="mt-3 w-full text-sm" aria-label="Subject-wise learning progress">
          <thead className="text-left text-xs text-slate-500"><tr><th className="py-1 pr-2 font-medium">Subject</th><th className="py-1 pr-2 font-medium">Goals</th><th className="py-1 pr-2 font-medium">Exam average</th></tr></thead>
          <tbody>{d.subjects.map((s) => <tr key={s.subjectId} className="border-t border-slate-100"><td className="py-1 pr-2 text-slate-900">{s.subjectName}</td><td className="py-1 pr-2 text-slate-700">{tallyText(s.tally)}</td><td className="py-1 pr-2 text-slate-700">{percentLabel(s.examAverage)}</td></tr>)}</tbody>
        </table>
      )}
      {d.overall.total > 0 && <p className="mt-2 text-xs text-slate-600" data-testid="overall">Overall, worked out from the separate goals: {tallyText(d.overall)}{d.overall.percent !== null ? `. ${d.overall.percent}% of the evaluated goals achieved.` : '.'}</p>}
      {d.notice && <p className="mt-2 text-sm text-slate-500">{d.notice}</p>}
    </section>
  );
}

// ─── Scheduling and moving ──────────────────────────────────────────────────────────────────────────────────────
export function ScheduleForm({ busy = false, error = null, onSubmit }: { busy?: boolean; error?: string | null; onSubmit: (v: { date: string; start: string; end: string }) => void }) {
  const [v, setV] = React.useState({ date: '', start: '', end: '' });
  return (
    <section aria-label="Schedule the review meeting" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="schedule-form">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">Schedule the monthly review meeting</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Meeting date</span><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Start</span><Input type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">End</span><Input type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></label>
      </div>
      <p className="mt-1 text-xs text-slate-600">The meeting date is the end date of the current learning plan for every subject.</p>
      <div className="mt-2"><Button type="button" size="sm" isLoading={busy} disabled={busy || !v.date || (!!v.start !== !!v.end)} onClick={() => onSubmit(v)}>Schedule the meeting</Button></div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

export function ReviewMoveForm({ d, busy = false, error = null, onSubmit, onCancel }: { d: ReviewData; busy?: boolean; error?: string | null; onSubmit: (v: { newDate: string; newStart: string; newEnd: string; reason: string }) => void; onCancel: () => void }) {
  const m = d.meeting as NonNullable<ReviewData['meeting']>;
  const clock = (x: number | null) => (x === null ? '' : `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`);
  const [v, setV] = React.useState({ newDate: m.date, newStart: clock(m.startMinute), newEnd: clock(m.endMinute), reason: '' });
  const same = v.newDate === m.date && v.newStart === clock(m.startMinute) && v.newEnd === clock(m.endMinute);
  return (
    <section aria-label="Reschedule the review meeting" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="review-move">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">Reschedule the meeting now on {longDayLabel(m.date)}</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New date</span><Input type="date" value={v.newDate} onChange={(e) => setV({ ...v, newDate: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New start</span><Input type="time" value={v.newStart} onChange={(e) => setV({ ...v, newStart: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New end</span><Input type="time" value={v.newEnd} onChange={(e) => setV({ ...v, newEnd: e.target.value })} /></label>
      </div>
      <label className="mt-2 block text-sm"><span className="mb-1 block text-slate-700">Reason <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></label>
      <p className="mt-1 text-xs text-slate-600">The first date is kept in the history, the end date of the learning plan moves with the meeting, and the tutors are told in the app. You tell the parent.</p>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || same || !v.reason.trim()} onClick={() => onSubmit(v)}>Move the meeting</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

// ─── The meeting itself ─────────────────────────────────────────────────────────────────────────────────────────
export function MeetingRecord({ d, busy, call }: { d: ReviewData; busy: boolean; call: Call }) {
  const m = d.meeting as NonNullable<ReviewData['meeting']>;
  const base = `/mentoring/reviews/${m.id}`;
  const [reason, setReason] = React.useState('');
  const [draft, setDraft] = React.useState<ActualDraft>(() => draftOfActual(m));
  const problems = actualProblems(draft);
  return (
    <Section title="Meeting details">
      {m.conducted === null && d.canWork && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">If the meeting was not held, why</span><textarea className={AREA} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => call('conducted', `${base}/conducted`, 'POST', { conducted: true }, 'Recorded that the meeting was held.')}>The meeting was held</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => call('conducted', `${base}/conducted`, 'POST', { conducted: false, reason }, 'Recorded that the meeting was not held.')}>The meeting was not held</Button>
          </div>
        </div>
      )}
      {m.conducted === null && !d.canWork && <p className="text-sm text-slate-500">The meeting has not been recorded as held.</p>}
      {m.conducted === false && <p className="text-sm text-red-700">The meeting was not held: {m.notConductedReason}. Reschedule it to continue.</p>}
      {m.conducted === true && (
        <>
          {m.actual && <p className="text-sm text-slate-700" data-testid="actual-summary">Held on {longDayLabel(m.actual.date)}, {timeLabel(m.actual.startMinute, m.actual.endMinute)}. Attended by {m.attendees.join(', ')}. {PARTICIPATION_CHOICES.find((p) => p[0] === m.participation)?.[1]}.{m.participationNote ? ` ${m.participationNote}` : ''}</p>}
          {d.canWork && (
            <div className="space-y-2 rounded-md bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block text-sm"><span className="mb-1 block text-slate-700">Date held</span><Input type="date" value={draft.actualDate} onChange={(e) => setDraft({ ...draft, actualDate: e.target.value })} /></label>
                <label className="block text-sm"><span className="mb-1 block text-slate-700">Actual start</span><Input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
                <label className="block text-sm"><span className="mb-1 block text-slate-700">Actual end</span><Input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
              </div>
              <label className="block text-sm"><span className="mb-1 block text-slate-700">Attendees, one to a line</span><textarea className={AREA} rows={2} value={draft.attendeesText} onChange={(e) => setDraft({ ...draft, attendeesText: e.target.value })} /></label>
              <label className="block text-sm"><span className="mb-1 block text-slate-700">Parent participation</span>
                <Select value={draft.participation} onChange={(e) => setDraft({ ...draft, participation: e.target.value })}><option value="">Choose</option>{PARTICIPATION_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
              <label className="block text-sm"><span className="mb-1 block text-slate-700">Note about the parent</span><Input value={draft.participationNote} onChange={(e) => setDraft({ ...draft, participationNote: e.target.value })} /></label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy || problems.length > 0} onClick={() => call('actual', `${base}/actual`, 'PUT', payloadOfActual(draft), 'The meeting details are saved.')}>Save the meeting details</Button>
                {problems.length > 0 && <p className="text-xs text-slate-500" data-testid="actual-missing">Still needed: {problems.join(', ')}.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ─── The exam record of the period ──────────────────────────────────────────────────────────────────────────────
export function ExamRecord({ d, busy, call }: { d: ReviewData; busy: boolean; call: Call }) {
  const m = d.meeting as NonNullable<ReviewData['meeting']>;
  const [note, setNote] = React.useState(m.examsReviewed?.note ?? '');
  const groups = new Map<string, ReviewExam[]>();
  for (const e of d.exams.items) groups.set(e.subjectName, [...(groups.get(e.subjectName) ?? []), e]);
  return (
    <Section title="Exam record of this learning period" hint={d.period.start && d.period.end ? `Exams from ${longDayLabel(d.period.start)} to ${longDayLabel(d.period.end)}. Nothing outside this period is shown.` : undefined}>
      {d.exams.message && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500" data-testid="no-exam-records">{d.exams.message}</p>}
      {d.exams.warnings.map((w) => <p key={w} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{w}</p>)}
      {[...groups].map(([subject, items]) => (
        <div key={subject} data-testid="exam-group">
          <h4 className="mb-1 text-sm font-medium text-slate-900">{subject}</h4>
          <ul className="space-y-2">
            {items.map((e) => (
              <li key={e.id} className="rounded-md border border-slate-200 p-2 text-sm" data-testid="exam-record">
                <p className="font-medium text-slate-900">{e.title}{e.kind === 'RE_EXAM' ? ' (re-exam)' : ''}, {longDayLabel(e.date)}</p>
                <p className="text-slate-700">{e.conducted === false ? 'Not conducted.' : e.marksObtained === null ? 'Marks not recorded.' : `Marks ${e.marksObtained} of ${e.maxMarks}, ${e.percentage}%.`} Chapters: {e.chapters.join(', ') || 'none listed'}.{e.portion ? ` Portion: ${e.portion}.` : ''}</p>
                <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
                  {([['Areas of weakness', e.weaknesses], ['Topics to improve', e.topicsToImprove], ['Tutor suggestions', e.tutorSuggestions], ['Mentor remarks', e.mentorRemarks]] as Array<[string, string | null]>).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline">{v ?? 'None recorded'}</dd></div>)}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {m.examsReviewed ? <p className="text-sm text-emerald-700" data-testid="exams-reviewed">Reviewed {when(m.examsReviewed.at)}.{m.examsReviewed.note ? ` ${m.examsReviewed.note}` : ''}</p> : d.canWork && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <label className="block text-sm"><span className="mb-1 block text-slate-700">Note, for example that there were no exams</span><Input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call('exams', `/mentoring/reviews/${m.id}/exams-reviewed`, 'POST', { note }, 'Recorded that the exam performance was reviewed.')}>{d.exams.items.length === 0 ? 'Record that there are no exams to review' : 'I have reviewed the exam performance'}</Button>
        </div>
      )}
    </Section>
  );
}

// ─── Goals ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function GoalCard({ g, canWork, busy, onSave, onRemove }: { g: ReviewGoal; canWork: boolean; busy: boolean; onSave: (d: GoalDraft) => void; onRemove: () => void }) {
  const [draft, setDraft] = React.useState<GoalDraft>(() => draftOfGoal(g));
  const problems = goalProblems(draft);
  const set = <K extends keyof GoalDraft>(k: K, v: GoalDraft[K]) => setDraft({ ...draft, [k]: v });
  return (
    <li className="rounded-md border border-slate-200 p-2 text-sm" data-testid="goal" data-result={g.result ?? 'NONE'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto font-medium text-slate-900">{g.goal}</span>
        {g.source === 'PLAN' && <Badge variant="default">From the plan</Badge>}
        <Badge variant={g.result === 'YES' ? 'success' : g.result === 'NO' ? 'danger' : g.result === 'PARTIALLY' ? 'warning' : 'default'}>Goal achieved: {resultLabel(g.result)}</Badge>
      </div>
      {canWork ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs"><span className="mb-1 block text-slate-700">Expected learning outcome</span><textarea className={AREA} rows={2} value={draft.expectedOutcome} onChange={(e) => set('expectedOutcome', e.target.value)} /></label>
          <label className="block text-xs"><span className="mb-1 block text-slate-700">Actual progress <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={draft.actualProgress} onChange={(e) => set('actualProgress', e.target.value)} /></label>
          <label className="block text-xs"><span className="mb-1 block text-slate-700">Goal achieved? <span className="text-red-600">required</span></span>
            <Select value={draft.result} onChange={(e) => set('result', e.target.value as GoalDraft['result'])}><option value="">Not evaluated</option>{RESULT_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
          <label className="block text-xs"><span className="mb-1 block text-slate-700">Evidence or observation</span><textarea className={AREA} rows={2} value={draft.evidence} onChange={(e) => set('evidence', e.target.value)} /></label>
          <label className="block text-xs"><span className="mb-1 block text-slate-700">Improvement areas</span><textarea className={AREA} rows={2} value={draft.improvementAreas} onChange={(e) => set('improvementAreas', e.target.value)} /></label>
          <label className="block text-xs"><span className="mb-1 block text-slate-700">Remaining gaps</span><textarea className={AREA} rows={2} value={draft.remainingGaps} onChange={(e) => set('remainingGaps', e.target.value)} /></label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || !draft.goal.trim()} onClick={() => onSave(draft)}>Save this goal</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>Remove this goal</Button>
            {problems.length > 0 && <p className="text-xs text-slate-500" data-testid="goal-missing">Still needed: {problems.join(', ')}.</p>}
          </div>
        </div>
      ) : (
        <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
          {([['Expected outcome', g.expectedOutcome], ['Actual progress', g.actualProgress], ['Evidence', g.evidence], ['Improvement areas', g.improvementAreas], ['Remaining gaps', g.remainingGaps]] as Array<[string, string | null]>).map(([k, v]) => v ? <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline">{v}</dd></div> : null)}
        </dl>
      )}
    </li>
  );
}

export function GoalEvaluation({ d, busy, call }: { d: ReviewData; busy: boolean; call: Call }) {
  const m = d.meeting as NonNullable<ReviewData['meeting']>;
  const [adding, setAdding] = React.useState<{ subjectId: string; draft: GoalDraft } | null>(null);
  const none = d.subjects.every((s) => s.goals.length === 0);
  return (
    <Section title="Subject-wise goal evaluation" hint="Each goal is evaluated on its own. The result of a subject and the overall result are worked out from these goals.">
      {d.canWork && none && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call('seed', `/mentoring/reviews/${m.id}/goals/from-plan`, 'POST', {}, 'The goals written in the learning plan are now here to evaluate.')}>Take the goals from the learning plan</Button>}
      {d.subjects.length === 0 && <p className="text-sm text-slate-500">There is no learning plan to evaluate.</p>}
      {d.subjects.map((s) => (
        <div key={s.subjectId} className="space-y-2" data-testid="goal-subject">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="mr-auto text-sm font-medium text-slate-900">{s.subjectName}</h4>
            <span className="text-xs text-slate-600" data-testid="subject-tally">{tallyText(s.tally)}{s.tally.result ? `. Subject result: ${resultLabel(s.tally.result)}` : ''}</span>
          </div>
          <p className="text-xs text-slate-600">Planned: {s.plan.description}</p>
          {s.goals.length === 0 && <p className="text-xs text-slate-500">No goal to evaluate for this subject yet.</p>}
          <ul className="space-y-2">
            {s.goals.map((g) => <GoalCard key={`${g.id}-${g.evaluatedAt ?? ''}`} g={g} canWork={d.canWork} busy={busy} onSave={(draft) => call('goal', `/mentoring/review-goals/${g.id}`, 'PUT', payloadOfGoal(draft), 'The goal is saved.')} onRemove={() => call('goal', `/mentoring/review-goals/${g.id}/remove`, 'POST', {}, 'The goal was removed.')} />)}
          </ul>
          {d.canWork && (adding?.subjectId === s.subjectId ? (
            <div className="space-y-2 rounded-md bg-slate-50 p-3">
              <label className="block text-sm"><span className="mb-1 block text-slate-700">Planned goal</span><Input value={adding.draft.goal} onChange={(e) => setAdding({ ...adding, draft: { ...adding.draft, goal: e.target.value } })} /></label>
              <label className="block text-sm"><span className="mb-1 block text-slate-700">Expected learning outcome</span><Input value={adding.draft.expectedOutcome} onChange={(e) => setAdding({ ...adding, draft: { ...adding.draft, expectedOutcome: e.target.value } })} /></label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy || !adding.draft.goal.trim()} onClick={() => call('goal', `/mentoring/reviews/${m.id}/subjects/${s.subjectId}/goals`, 'POST', payloadOfGoal(adding.draft), 'The goal was added.', () => setAdding(null))}>Add the goal</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
              </div>
            </div>
          ) : <Button type="button" size="sm" variant="ghost" onClick={() => setAdding({ subjectId: s.subjectId, draft: emptyGoalDraft() })}>Add a goal for {s.subjectName}</Button>)}
        </div>
      ))}
    </Section>
  );
}

// ─── Improvement areas, remarks and observations ────────────────────────────────────────────────────────────────
export function FieldsForm({ title, hint, fields, values, canWork, busy, saveLabel, onSave }: { title: string; hint?: string; fields: Array<[string, string]>; values: Record<string, string | null>; canWork: boolean; busy: boolean; saveLabel: string; onSave: (v: Record<string, string>) => void }) {
  const [draft, setDraft] = React.useState<Record<string, string>>(() => Object.fromEntries(fields.map(([k]) => [k, values[k] ?? ''])));
  return (
    <Section title={title} hint={hint}>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map(([k, label]) => <label key={k} className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span><textarea className={AREA} rows={2} disabled={!canWork} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></label>)}
      </div>
      {canWork && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSave(draft)}>{saveLabel}</Button>}
    </Section>
  );
}

export function ImprovementAreas({ d, busy, call }: { d: ReviewData; busy: boolean; call: Call }) {
  const m = d.meeting as NonNullable<ReviewData['meeting']>;
  const [text, setText] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');
  const [reason, setReason] = React.useState(d.remarks.noImprovementReason ?? '');
  const all = [...d.subjects.flatMap((s) => s.improvementAreas.map((a) => ({ ...a, subject: s.subjectName }))), ...d.generalAreas.map((a) => ({ ...a, subject: 'The student as a whole' }))];
  return (
    <Section title="Areas requiring improvement" hint="Concepts, skills or behaviours that need more attention. A subject can have several.">
      {all.length === 0 && <p className="text-sm text-slate-500" data-testid="no-areas">No improvement area recorded yet.</p>}
      <ul className="space-y-1" aria-label="Improvement areas">
        {all.map((a) => <li key={a.id} className="flex items-center gap-2 text-sm" data-testid="area"><span className="mr-auto text-slate-900"><span className="font-medium">{a.subject}:</span> {a.area}</span>{d.canWork && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => call('area', `/mentoring/review-areas/${a.id}/remove`, 'POST', {}, 'The improvement area was removed.')}>Remove</Button>}</li>)}
      </ul>
      {d.canWork && (
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
          <Select aria-label="Subject of the improvement area" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">The student as a whole</option>{d.subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}</Select>
          <Input aria-label="Improvement area" placeholder="Concept, skill or behaviour" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="button" size="sm" variant="outline" disabled={busy || !text.trim()} onClick={() => call('area', `/mentoring/reviews/${m.id}/areas`, 'POST', { area: text, ...(subjectId ? { subjectId } : {}) }, 'The improvement area was added.', () => setText(''))}>Add</Button>
        </div>
      )}
      {d.canWork && all.length === 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 text-sm"><span className="mb-1 block text-slate-700">Or, if none is needed, why</span><Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <Button type="button" size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => call('remarks', `/mentoring/reviews/${m.id}/remarks`, 'PUT', { noImprovementReason: reason }, 'Recorded that no improvement area is needed.')}>Record the reason</Button>
        </div>
      )}
    </Section>
  );
}

export function TutorObservations({ d, busy, call }: { d: ReviewData; busy: boolean; call: Call }) {
  const m = d.meeting as NonNullable<ReviewData['meeting']>;
  const [drafts, setDrafts] = React.useState<Record<string, string>>(() => Object.fromEntries(d.subjects.map((s) => [s.subjectId, s.tutorObservation?.note ?? ''])));
  return (
    <Section title="Tutor observations" hint="What each subject tutor said about the student. You record it, so it shows as collected by you. The tutor feedback already in the system is shown beside it.">
      {d.subjects.map((s) => (
        <div key={s.subjectId} className="space-y-1" data-testid="tutor-subject">
          <h4 className="text-sm font-medium text-slate-900">{s.subjectName}</h4>
          {s.tutorFeedback.length > 0 && <ul className="text-xs text-slate-600" aria-label={`Tutor feedback, ${s.subjectName}`}>{s.tutorFeedback.map((f, i) => <li key={`${f.date}-${i}`}>{longDayLabel(f.date)}, {f.source}: {f.text}</li>)}</ul>}
          {s.tutorFeedback.length === 0 && <p className="text-xs text-slate-500">No tutor feedback recorded in the system for this period.</p>}
          <textarea aria-label={`Tutor observation, ${s.subjectName}`} className={AREA} rows={2} disabled={!d.canWork} value={drafts[s.subjectId] ?? ''} onChange={(e) => setDrafts({ ...drafts, [s.subjectId]: e.target.value })} />
          {d.canWork && <Button type="button" size="sm" variant="outline" disabled={busy || !(drafts[s.subjectId] ?? '').trim()} onClick={() => call('tutor', `/mentoring/reviews/${m.id}/subjects/${s.subjectId}/tutor-note`, 'PUT', { note: drafts[s.subjectId] }, `Saved the tutor observation for ${s.subjectName}.`)}>Save for {s.subjectName}</Button>}
        </div>
      ))}
    </Section>
  );
}

// ─── The next plan ──────────────────────────────────────────────────────────────────────────────────────────────
export function NextPlanSubject({ s, canWork, busy, onSave }: { s: ReviewSubject; canWork: boolean; busy: boolean; onSave: (d: NextPlanDraft) => void }) {
  const [draft, setDraft] = React.useState<NextPlanDraft>(() => draftOfNextPlan(s));
  const set = <K extends keyof NextPlanDraft>(k: K, v: NextPlanDraft[K]) => setDraft({ ...draft, [k]: v });
  const problems = nextPlanProblems(draft);
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2" data-testid="next-plan-subject" data-written={s.nextPlan !== null}>
      <div className="flex flex-wrap items-center gap-2"><h4 className="mr-auto text-sm font-medium text-slate-900">{s.subjectName}</h4><Badge variant={s.nextPlan ? 'success' : 'warning'}>{s.nextPlan ? 'Written' : 'Not written'}</Badge></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs"><span className="mb-1 block text-slate-700">Goals are</span><Select disabled={!canWork} value={draft.kind} onChange={(e) => set('kind', e.target.value)}>{NEXT_PLAN_KIND_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        <label className="block text-xs"><span className="mb-1 block text-slate-700">Description <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} disabled={!canWork} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="block text-xs"><span className="mb-1 block text-slate-700">Subject-specific objectives</span><textarea className={AREA} rows={2} disabled={!canWork} value={draft.objectives} onChange={(e) => set('objectives', e.target.value)} /></label>
        <label className="block text-xs"><span className="mb-1 block text-slate-700">Planned topics</span><textarea className={AREA} rows={2} disabled={!canWork} value={draft.topics} onChange={(e) => set('topics', e.target.value)} /></label>
        <label className="block text-xs sm:col-span-2"><span className="mb-1 block text-slate-700">Expected outcomes</span><textarea className={AREA} rows={2} disabled={!canWork} value={draft.outcomes} onChange={(e) => set('outcomes', e.target.value)} /></label>
      </div>
      {canWork && <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={busy || problems.length > 0} onClick={() => onSave(draft)}>Save the next plan for {s.subjectName}</Button>{problems.length > 0 && <p className="text-xs text-slate-500">Still needed: {problems.join(', ')}.</p>}</div>}
    </div>
  );
}

export function NextPlan({ d, busy, call }: { d: ReviewData; busy: boolean; call: Call }) {
  const m = d.meeting as NonNullable<ReviewData['meeting']>;
  const written = d.subjects.filter((s) => s.nextPlan).length;
  return (
    <Section title="Next month learning plan" hint={`The next plan has the same fields as the Individual Learning Plan. It starts on ${longDayLabel(dayAfter(m.date))}, the day after this review, and becomes the active plan only when this review is completed. A new subject needs the schedule changed first.`}>
      {d.canWork && written === 0 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call('next', `/mentoring/reviews/${m.id}/next-plan/from-current`, 'POST', {}, 'The next plan was started from the current plan, as continued goals.')}>Start from the current plan</Button>}
      {d.subjects.map((s) => <NextPlanSubject key={`${s.subjectId}-${s.nextPlan?.description ?? ''}-${s.nextPlan?.kind ?? ''}`} s={s} canWork={d.canWork} busy={busy} onSave={(draft) => call('next', `/mentoring/reviews/${m.id}/subjects/${s.subjectId}/next-plan`, 'PUT', draft, `Saved the next plan for ${s.subjectName}.`)} />)}
      <div className="flex flex-wrap items-center gap-2">
        {m.nextPlanApproved ? <Badge variant="success" data-testid="next-plan-approved">Next plan approved {when(m.nextPlanApproved.at)}</Badge> : <Badge variant="warning">Next plan not approved</Badge>}
        {d.canWork && !m.nextPlanApproved && <Button type="button" size="sm" disabled={busy || written < d.subjects.length || d.subjects.length === 0} onClick={() => call('approve', `/mentoring/reviews/${m.id}/next-plan/approve`, 'POST', {}, 'The next plan is approved.')}>Approve the next plan</Button>}
      </div>
    </Section>
  );
}

// ─── Completing ─────────────────────────────────────────────────────────────────────────────────────────────────
export function CompletionChecklist({ d, busy, onComplete }: { d: ReviewData; busy: boolean; onComplete: () => void }) {
  const done = d.checklist.filter((c) => c.done).length;
  return (
    <Section title="Before the review can be completed" hint="Each item is recorded by you. Nothing completes itself.">
      <ul className="space-y-1" aria-label="Completion checklist">
        {d.checklist.map((c) => <li key={c.key} className="text-sm" data-testid="checklist-item" data-done={c.done}><span className={c.done ? 'text-emerald-700' : 'text-slate-700'}>{c.done ? 'Done' : 'Pending'}</span>, <span className="font-medium text-slate-900">{c.label}</span>: <span className="text-slate-600">{c.detail}</span></li>)}
      </ul>
      <p className="text-xs text-slate-600" data-testid="checklist-count">{done} of {d.checklist.length} recorded.</p>
      {d.canWork && <Button type="button" size="sm" isLoading={busy} disabled={busy || !d.canComplete} onClick={onComplete}>Complete the review and start the next learning plan</Button>}
    </Section>
  );
}

// ─── The page section ───────────────────────────────────────────────────────────────────────────────────────────
/** The monthly parent review for one student: the meeting, the period exam record, the goals, the remarks, the parent, the next plan. */
export function MonthlyReviewPanel({ activationId }: { activationId: string }) {
  const [data, setData] = React.useState<ReviewData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<string | null>(null);
  const base = `/mentoring/students/${activationId}/review`;

  const load = React.useCallback(async () => {
    try {
      setData(await mentoringApi(base));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The review could not be loaded.');
    }
  }, [base]);
  React.useEffect(() => { void load(); }, [load]);

  const act = async (label: string, run: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(label);
    setActionError(null);
    setNotice(null);
    try {
      await run();
      setNotice(done);
      after?.();
      await load();
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'That could not be done.');
    }
    setBusy(null);
  };
  const call: Call = (label, path, method, body, done, after) => void act(label, () => mentoringApi(path, method, body), done, after);
  const m = data?.meeting ?? null;
  const key = m ? `${m.id}-${data?.checklist.filter((c) => c.done).length}-${m.state}` : 'none';

  return (
    <section aria-label="Monthly review" className="space-y-3" data-testid="monthly-review">
      <h2 className="text-base font-semibold text-slate-900">{data ? `${data.student.name}, monthly parent review` : 'Monthly parent review'}</h2>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {actionError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Loading the review</p>}
      {data && <ReviewDashboard d={data} />}
      {data && !m && data.canWork && <ScheduleForm busy={busy !== null} error={null} onSubmit={(v) => call('schedule', `${base}/schedule`, 'POST', { date: v.date, ...(v.start ? { start: v.start, end: v.end } : {}) }, 'The meeting is scheduled and is now the end date of the learning plan.')} />}
      {data && m && data.canWork && m.conducted !== true && !moving && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setMoving(true)}>Reschedule the meeting</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => setCancelling('')}>Cancel the meeting</Button>
        </div>
      )}
      {data && m && cancelling !== null && (
        <section aria-label="Cancel the review meeting" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="review-cancel">
          <label className="block text-sm"><span className="mb-1 block text-slate-700">Why is the meeting being cancelled? <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={cancelling} onChange={(e) => setCancelling(e.target.value)} /></label>
          <p className="mt-1 text-xs text-slate-600">The learning plan loses its end date until a new meeting is scheduled.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={busy !== null || !cancelling.trim()} onClick={() => call('cancel', `/mentoring/reviews/${m.id}/cancel`, 'POST', { reason: cancelling }, 'The meeting was cancelled. The learning plan waits for a new date.', () => setCancelling(null))}>Cancel the meeting</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(null)}>Keep the meeting</Button>
          </div>
        </section>
      )}
      {data && m && moving && <ReviewMoveForm d={data} busy={busy !== null} error={actionError} onCancel={() => setMoving(false)} onSubmit={(v) => call('move', `/mentoring/reviews/${m.id}/reschedule`, 'POST', v, 'The meeting was moved. The tutors were told in the app.', () => setMoving(false))} />}

      {data && m && (
        <div key={key} className="space-y-3">
          <MeetingRecord d={data} busy={busy !== null} call={call} />
          <ExamRecord d={data} busy={busy !== null} call={call} />
          <GoalEvaluation d={data} busy={busy !== null} call={call} />
          <ImprovementAreas d={data} busy={busy !== null} call={call} />
          <FieldsForm title="What improved" fields={REMARK_FIELDS.filter(([k]) => k === 'whatImproved')} values={data.remarks} canWork={data.canWork} busy={busy !== null} saveLabel="Save what improved" onSave={(v) => call('remarks', `/mentoring/reviews/${m.id}/remarks`, 'PUT', v, 'Saved.')} />
          <FieldsForm title="Expectations from the parent" hint="Home practice, parent involvement, study routine, attendance support and other commitments." fields={EXPECTATION_FIELDS} values={data.remarks} canWork={data.canWork} busy={busy !== null} saveLabel="Save the expectations" onSave={(v) => call('remarks', `/mentoring/reviews/${m.id}/remarks`, 'PUT', v, 'Saved.')} />
          <TutorObservations d={data} busy={busy !== null} call={call} />
          <FieldsForm title="Mentor observations" fields={REMARK_FIELDS.filter(([k]) => k === 'mentorObservations')} values={data.remarks} canWork={data.canWork} busy={busy !== null} saveLabel="Save my observations" onSave={(v) => call('remarks', `/mentoring/reviews/${m.id}/remarks`, 'PUT', v, 'Saved.')} />
          {m.conducted === true && <FieldsForm title="Post-meeting remarks, parent communication" hint="Record what the parent said after the meeting. This is kept apart from your observations and the tutor observations." fields={POST_MEETING_FIELDS} values={data.postMeeting} canWork={data.canWork} busy={busy !== null} saveLabel="Save the parent communication" onSave={(v) => call('post', `/mentoring/reviews/${m.id}/post-meeting`, 'PUT', v, 'Saved.')} />}
          <NextPlan d={data} busy={busy !== null} call={call} />
          <CompletionChecklist d={data} busy={busy === 'complete'} onComplete={() => call('complete', `/mentoring/reviews/${m.id}/complete`, 'POST', {}, 'The review is completed. The next learning plan is now active and waits for the next meeting date.')} />
        </div>
      )}

      {data && data.previous.length > 0 && (
        <Section title="Previous reviews">
          <ul className="space-y-0.5 text-sm" aria-label="Previous reviews">{data.previous.map((p) => <li key={p.meetingId} data-testid="previous-review">{p.periodStart && p.periodEnd ? `${longDayLabel(p.periodStart)} to ${longDayLabel(p.periodEnd)}` : longDayLabel(p.date)}, held {longDayLabel(p.date)}</li>)}</ul>
        </Section>
      )}
    </section>
  );
}
