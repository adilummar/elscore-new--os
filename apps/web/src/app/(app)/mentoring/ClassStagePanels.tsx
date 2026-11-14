"use client";

import * as React from 'react';
import { AlertTriangle, CalendarClock, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import { MeetLinkDisplay } from './ClassSections';
import { afterChecklist, timingHistory } from './class-sections-view';
import {
  AFTER_ITEMS, ActualDraft, AfterDraft, RescheduleDraft, actualDraftOf, actualNoPayload, actualPayload, actualProblems, actualYesPayload, afterDraftOf, afterPayload, afterProblems, beforePayload, beforeProblems, evidenceLines, nextStep, reschedulePayload,
  rescheduleDraftOf, rescheduleProblems, StepId, submissionNote, submissionOf, timeInputOf, timeLines, toggleCode, tutorUpdateFull, visibleChoices, BEFORE_ITEM, STEP_LABELS,
} from './class-stepper-view';
import { longDayLabel } from './timetable-view';
import { hoursText, timeLabel } from './class-view';
import { FOCUS, PANEL, StatusChip } from './mentoring-ui';
import { mentoringApi } from './mentoring-client';
import type { WorkspaceData } from './workspace-view';

export type Run = (label: string, fn: () => Promise<unknown>, done: string, then?: () => void) => void;
interface PanelProps { w: WorkspaceData; classKey: string; busy: boolean; canWork: boolean; run: Run; go: (id: StepId) => void }

const FIELD = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const BOX = 'mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const closed = (w: WorkspaceData) => ['CANCELLED', 'VERIFIED', 'NOT_CONDUCTED'].includes(w.class.status);

function StepHeading({ id, hint }: { id: StepId; hint: string }) {
  return <div><h2 className="text-lg font-semibold text-slate-900">{STEP_LABELS[id]}</h2><p className="mt-0.5 text-sm text-slate-700">{hint}</p></div>;
}

function Problems({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return <ul className="space-y-0.5 text-sm text-amber-900" aria-label="Still needed" data-testid="still-needed">{items.map((p) => <li key={p} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{p}</li>)}</ul>;
}

// ─── Before Class ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The Mentor's before-class checklist. The tick is their statement that the tutor sent the reminder; it is saved with who and when. It is kept
 * apart from the reminder message record below (prepared, copied, recorded as shared), which stays the evidence and is never changed by the tick.
 */
export function BeforePanel({ w, classKey, busy, canWork, run, go, evidence, onReschedule }: PanelProps & { evidence: React.ReactNode; onReschedule: () => void }) {
  const saved = submissionOf(w, 'BEFORE');
  const [ticked, setTicked] = React.useState(!!saved);
  React.useEffect(() => { setTicked(!!saved); }, [saved?.version, saved?.submittedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = canWork && !closed(w);
  const problems = beforeProblems(ticked);
  const unchanged = !!saved && ticked;
  const submit = () => {
    if (unchanged) { go('after'); return; }
    run('submit-before', () => mentoringApi(`/mentoring/class-workspace/${encodeURIComponent(classKey)}/stages/BEFORE/submit`, 'POST', beforePayload(ticked)), 'Before Class is saved.', () => go('after'));
  };
  return (
    <div className="space-y-4" data-testid="stage-before">
      <StepHeading id="before" hint="Check the class details and record that the tutor sent the reminder." />
      <section aria-label="Class details" className={`${PANEL} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-slate-600">Date</dt><dd className="text-slate-900">{longDayLabel(w.class.date)}</dd></div>
            <div><dt className="text-xs font-medium text-slate-600">Scheduled time</dt><dd className="text-slate-900" data-testid="scheduled-time">{timeLabel(w.class)}</dd></div>
          </dl>
          {w.workflow?.canReschedule && canWork && (
            <Button type="button" size="sm" variant="outline" onClick={onReschedule}><CalendarClock className="mr-1.5 h-4 w-4" aria-hidden="true" />Edit Schedule / Reschedule</Button>
          )}
        </div>
        <div className="mt-3"><MeetLinkDisplay link={w.before.meetLink} source={w.before.meetLinkSource ?? null} /></div>
      </section>

      <section aria-label="Before-class checklist" className={`${PANEL} p-4`} data-testid="before-checklist" data-submitted={!!saved}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Before-class checklist</h3>
          <StatusChip tone={saved ? 'success' : 'neutral'}>{saved ? 'Submitted' : 'Not submitted'}</StatusChip>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <input id="reminder-sent" type="checkbox" className={BOX} checked={ticked} disabled={!can || busy} onChange={(e) => setTicked(e.target.checked)} aria-describedby="reminder-sent-note" />
          <div className="min-w-0 flex-1">
            <label htmlFor="reminder-sent" className="text-sm font-medium text-slate-900">{BEFORE_ITEM.label}</label>
            <p id="reminder-sent-note" className="mt-1 text-sm text-slate-700">{saved ? submissionNote(saved) : 'Not submitted yet.'} Ticking records what you say. It does not prove the student received or read it.</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {can && !unchanged && <Problems items={problems} />}
          {can ? (
            <Button type="button" disabled={busy || (!unchanged && problems.length > 0)} onClick={submit}>{unchanged ? 'Continue' : saved ? 'Save correction & Continue' : 'Submit & Continue'}</Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => go('after')}>Continue to After Class</Button>
          )}
          {saved && <p className="text-xs text-slate-600">To change a submitted checklist, correct it and submit again. The earlier version stays in the class history.</p>}
        </div>
      </section>

      <section aria-label="Reminder message record" className="space-y-2" data-testid="reminder-evidence">
        <h3 className="text-sm font-semibold text-slate-900">Reminder message and sharing record</h3>
        <p className="text-sm text-slate-700">The record below shows whether the message was prepared, copied, or recorded as shared. It is separate from the tick above, and neither changes the other.</p>
        {w.before.warning && <p role="alert" className={`rounded-md px-3 py-2 text-sm ${w.before.warning.level === 'red' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{w.before.warning.text}</p>}
        {evidence}
      </section>
    </div>
  );
}

// ─── After Class ─────────────────────────────────────────────────────────────────────────────────────────────────
export function AfterPanel({ w, classKey, busy, canWork, run, go, evidence }: PanelProps & { evidence: React.ReactNode }) {
  const saved = submissionOf(w, 'AFTER');
  const [d, setD] = React.useState<AfterDraft>(() => afterDraftOf(saved));
  React.useEffect(() => { setD(afterDraftOf(saved)); }, [saved?.version, saved?.submittedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = canWork && !closed(w);
  const choices = visibleChoices(w.workflow?.activityChoices ?? []);
  const problems = afterProblems(d);
  const savedDraft = afterDraftOf(saved);
  const unchanged = !!saved && JSON.stringify(savedDraft.items) === JSON.stringify(d.items) && [...savedDraft.activities].sort().join() === [...d.activities].sort().join() && savedDraft.otherDescription.trim() === d.otherDescription.trim();
  const evidenceRows = afterChecklist(w);
  const update = tutorUpdateFull(w);
  const submit = () => {
    if (unchanged) { go('timing'); return; }
    run('submit-after', () => mentoringApi(`/mentoring/class-workspace/${encodeURIComponent(classKey)}/stages/AFTER/submit`, 'POST', afterPayload(d)), 'After Class is saved.', () => go('timing'));
  };
  return (
    <div className="space-y-4" data-testid="stage-after">
      <StepHeading id="after" hint="Record what was done after the class. Read what the tutor reported." />
      <section aria-label="After-class checklist" className={`${PANEL} p-4`} data-testid="after-checklist" data-submitted={!!saved}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">After-class checklist</h3>
          <StatusChip tone={saved ? 'success' : 'neutral'}>{saved ? 'Submitted' : 'Not submitted'}</StatusChip>
        </div>
        <ul className="mt-2 space-y-3">
          {AFTER_ITEMS.map((i) => {
            const proof = i.key === 'checklistShared' ? evidenceRows[0] : i.key === 'voiceShared' ? evidenceRows[1] : evidenceRows[2];
            return (
              <li key={i.key} className="flex items-start gap-3">
                <input id={`after-${i.key}`} type="checkbox" className={BOX} checked={!!d.items[i.key]} disabled={!can || busy} onChange={(e) => setD({ ...d, items: { ...d.items, [i.key]: e.target.checked } })} aria-describedby={`after-${i.key}-note`} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`after-${i.key}`} className="text-sm font-medium text-slate-900">{i.label}</label>
                  <p id={`after-${i.key}-note`} className="mt-0.5 text-xs text-slate-600">Record on file: {proof.done ? 'yes' : 'no'}. {proof.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <fieldset className="mt-4" disabled={!can || busy}>
          <legend className="text-sm font-medium text-slate-900">Activities given <span className="font-normal text-slate-600">(choose one or more)</span></legend>
          {choices.length === 0 && <p className="mt-1 text-sm text-slate-700">No activity options are set up. The Mentoring Head adds them in Settings.</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="activity-choices">
            {choices.map((c) => (
              <label key={c.code} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${d.activities.includes(c.code) ? 'border-brand-500 bg-brand-50 text-slate-900' : 'border-slate-300 bg-white text-slate-800'}`}>
                <input type="checkbox" className="h-4 w-4 rounded border-slate-400 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500" checked={d.activities.includes(c.code)} onChange={() => setD({ ...d, activities: toggleCode(d.activities, c.code) })} />{c.label}
              </label>
            ))}
          </div>
          {d.activities.includes('OTHER') && (
            <label className="mt-3 block text-sm"><span className="mb-1 block font-medium text-slate-800">Describe the other activity</span><input className={FIELD} maxLength={200} value={d.otherDescription} onChange={(e) => setD({ ...d, otherDescription: e.target.value })} /></label>
          )}
        </fieldset>

        <div className="mt-4 space-y-2">
          {can && !unchanged && <Problems items={problems} />}
          {can ? <Button type="button" disabled={busy || (!unchanged && problems.length > 0)} onClick={submit}>{unchanged ? 'Continue' : saved ? 'Save correction & Continue' : 'Submit & Continue'}</Button> : <Button type="button" variant="outline" onClick={() => go('timing')}>Continue to Actual Time</Button>}
          {saved && <p className="text-xs text-slate-600">{submissionNote(saved)} To change it, correct the items and submit again. The earlier version stays in the class history.</p>}
        </div>
      </section>

      <section aria-label="Update from the tutor" className={`${PANEL} p-4`} data-testid="tutor-update">
        <h3 className="text-sm font-semibold text-slate-900">Update from the tutor</h3>
        <p className="mt-0.5 text-xs text-slate-600">Submitted in the Tutor Portal. You can read it here; only the tutor can change it.</p>
        {update.length === 0
          ? <p className="mt-2 text-sm text-slate-700">The tutor has not submitted the class update yet.</p>
          : <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{update.map((r) => <div key={r.label}><dt className="text-xs font-medium text-slate-600">{r.label}</dt><dd className="whitespace-pre-wrap text-sm text-slate-900">{r.value}</dd></div>)}</dl>}
      </section>

      <section aria-label="What was shared" className="space-y-3">{evidence}</section>
    </div>
  );
}

// ─── Actual Time ─────────────────────────────────────────────────────────────────────────────────────────────────
export function TimingPanel({ w, classKey, busy, canWork, run, go }: PanelProps) {
  const lines = timeLines(w);
  const mine = w.workflow?.mentorActual ?? null;
  const confirmed = w.workflow?.confirmedSchedule ?? null;
  const tutorU = w.class.update;
  const scheduledStart = w.class.startMinute;
  const scheduledEnd = w.class.endMinute;
  const start = mine?.startMinute ?? (tutorU?.conducted !== false ? tutorU?.actualStartMinute : null) ?? scheduledStart;
  const end = mine?.endMinute ?? (tutorU?.conducted !== false ? tutorU?.actualEndMinute : null) ?? scheduledEnd;

  const initialChoice = mine ? 'YES' : 'NO';
  const [choice, setChoice] = React.useState<'NO' | 'YES'>(initialChoice);
  const [d, setD] = React.useState<ActualDraft>({
    choice: initialChoice,
    start: timeInputOf(start),
    end: timeInputOf(end),
    reason: mine?.reason ?? '',
    confirmed: !!mine,
  });

  React.useEffect(() => {
    const nextChoice = mine ? 'YES' : 'NO';
    setChoice(nextChoice);
    setD({
      choice: nextChoice,
      start: timeInputOf(mine ? mine.startMinute : start),
      end: timeInputOf(mine ? mine.endMinute : end),
      reason: mine?.reason ?? '',
      confirmed: !!mine,
    });
  }, [mine?.startMinute, mine?.endMinute, mine?.at, confirmed?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const can = canWork && !closed(w);
  const problems = choice === 'YES' ? actualProblems(d) : [];
  const history = timingHistory(w);
  const path = `/mentoring/class-workspace/${encodeURIComponent(classKey)}/actual-time`;

  const submitNo = () => {
    run(
      'actual-time-no',
      () => mentoringApi(path, 'PUT', actualNoPayload()),
      'Scheduled class time confirmed.',
      () => go('verification')
    );
  };

  const submitYes = () => {
    run(
      'actual-time-yes',
      () => mentoringApi(path, 'PUT', actualYesPayload(d)),
      'The actual time is recorded.',
      () => go('verification')
    );
  };

  const removeMyActualTime = () => {
    run(
      'actual-time-clear',
      () => mentoringApi(path, 'PUT', { clear: true, reason: d.reason.trim() || 'Cleared by mentor' }),
      'Your actual time is removed. The tutor report is unchanged.',
      () => {
        setChoice('NO');
      }
    );
  };

  return (
    <div className="space-y-4" data-testid="stage-timing">
      <StepHeading
        id="timing"
        hint="The scheduled time, the time the tutor reported and the time you record stay on separate lines. Recording a time never changes the schedule."
      />

      <section aria-label="Scheduled and actual time" className={`${PANEL} p-4`} data-testid="timing">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {lines.map((l) => (
            <div key={l.label}>
              <dt className="text-xs font-medium text-slate-600">{l.label}</dt>
              <dd className={`mt-0.5 text-base ${l.differs ? 'font-semibold text-amber-900' : 'text-slate-900'}`}>{l.value}</dd>
              {l.note && <p className="text-xs text-slate-600">{l.note}</p>}
            </div>
          ))}
        </dl>
        {lines.some((l) => l.differs) && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            An actual time differs from the schedule. The approved schedule is not changed. Verification decides the minutes that count.
          </p>
        )}
        {history.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-700">Changes to the reported time</p>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
              {history.map((h) => (
                <li key={h.version}>Submission {h.version}, {h.at.slice(0, 16).replace('T', ' ')} UTC{h.by ? `, by ${h.by}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {can && (
        <section aria-label="Record the actual time" className={`${PANEL} p-4`} data-testid="actual-form">
          <h3 className="text-sm font-semibold text-slate-900">Was there any change in the scheduled class time?</h3>
          <p className="mt-0.5 text-xs text-slate-600">Confirm whether the class happened at its scheduled time or differed.</p>

          <div className="mt-3 space-y-2">
            <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${choice === 'NO' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input
                type="radio"
                name="timeChangeQuestion"
                value="NO"
                checked={choice === 'NO'}
                onChange={() => setChoice('NO')}
                className="mt-0.5 h-4 w-4 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span className="font-medium text-slate-900">No, the class happened at the scheduled time.</span>
                <p className="mt-0.5 text-xs text-slate-600">The scheduled timetable will be followed. No time correction is created.</p>
              </div>
            </label>

            <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${choice === 'YES' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input
                type="radio"
                name="timeChangeQuestion"
                value="YES"
                checked={choice === 'YES'}
                onChange={() => setChoice('YES')}
                className="mt-0.5 h-4 w-4 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span className="font-medium text-slate-900">Yes, the actual class time was different.</span>
                <p className="mt-0.5 text-xs text-slate-600">Enter the actual start and end times with a mandatory reason.</p>
              </div>
            </label>
          </div>

          {choice === 'NO' && (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-800" data-testid="no-change-panel">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-600">Confirmed scheduled time:</p>
                  <p className="text-base font-semibold text-slate-900">{timeLabel(w.class)} ({hoursText(w.class.scheduledMinutes)})</p>
                </div>
                {confirmed && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                    Confirmed on record
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                The scheduled time will be preserved. No actual time correction record is created.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={submitNo}>
                  Confirm & Continue to Verification
                </Button>
                {mine && (
                  <Button type="button" variant="outline" disabled={busy} onClick={removeMyActualTime}>
                    Remove previous actual time correction
                  </Button>
                )}
              </div>
            </div>
          )}

          {choice === 'YES' && (
            <div className="mt-4 space-y-3" data-testid="time-change-form">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-800">Actual start</span>
                  <input type="time" className={FIELD} value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-800">Actual end</span>
                  <input type="time" className={FIELD} value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} />
                </label>
                <div className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-800">Scheduled reference</span>
                  <p className="py-2 text-sm text-slate-600">{timeLabel(w.class)}</p>
                </div>
                <label className="block text-sm sm:col-span-3">
                  <span className="mb-1 block font-medium text-slate-800">Reason for the difference</span>
                  <textarea
                    className={FIELD}
                    rows={2}
                    maxLength={1000}
                    placeholder="Explain why the class time differed from the schedule..."
                    value={d.reason}
                    onChange={(e) => setD({ ...d, reason: e.target.value })}
                  />
                </label>
              </div>

              <label className="flex items-start gap-2 pt-1 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={d.confirmed}
                  onChange={(e) => setD({ ...d, confirmed: e.target.checked })}
                />
                <span>I confirm that the actual class time differed from the scheduled time and this record is accurate.</span>
              </label>

              <div className="mt-3 space-y-2">
                <Problems items={problems.length ? [`Still needed: ${problems.join(', ')}.`] : []} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy || problems.length > 0} onClick={submitYes}>
                    {mine ? 'Save correction & Continue to Verification' : 'Save & Continue to Verification'}
                  </Button>
                  {mine && (
                    <Button type="button" variant="outline" disabled={busy} onClick={removeMyActualTime}>
                      Remove my actual time
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {(!can || closed(w)) && (
        <Button type="button" variant="outline" onClick={() => go('verification')}>
          Continue to Verification
        </Button>
      )}
    </div>
  );
}

// ─── Verification ────────────────────────────────────────────────────────────────────────────────────────────────
export function VerificationPanel({ w, busy, canWork, run, children }: Omit<PanelProps, 'go' | 'classKey'> & { children: React.ReactNode }) {
  const lines = evidenceLines(w);
  const [reason, setReason] = React.useState('');
  const sessionId = w.class.sessionId;
  const waiting = w.class.status === 'AWAITING_MENTOR_VERIFICATION';
  const send = (kind: 'CORRECTION' | 'INCOMPLETE') => run(`return-${kind}`, () => mentoringApi(`/mentoring/classes/${sessionId}/return`, 'POST', { reason: reason.trim(), kind }), kind === 'INCOMPLETE' ? 'The class is marked incomplete and returned to the tutor.' : 'The class is returned to the tutor for correction.', () => setReason(''));
  return (
    <div className="space-y-4" data-testid="stage-verification">
      <StepHeading id="verification" hint="Check the evidence, then verify the class yourself. Nothing here is verified automatically." />
      <section aria-label="Evidence" className={`${PANEL} p-4`} data-testid="evidence">
        <h3 className="text-sm font-semibold text-slate-900">Evidence for this class</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {lines.map((l) => (
            <li key={l.label} className="flex items-start gap-3 py-2 text-sm" data-ok={l.ok}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${l.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{l.ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}</span>
              <div><p className="font-medium text-slate-900">{l.label}</p><p className="text-slate-700">{l.ok ? 'Recorded' : 'Not recorded'}: {l.value}</p></div>
            </li>
          ))}
        </ul>
      </section>
      {children}
      {canWork && waiting && sessionId && (
        <section aria-label="Return the update" className="space-y-2 rounded-md border border-slate-200 bg-white p-4" data-testid="return-actions">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-800">Send back to the tutor <span className="font-normal text-slate-600">(reason required)</span></span><textarea className={FIELD} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || !reason.trim()} onClick={() => send('CORRECTION')}>Return for Correction</Button>
            <Button type="button" variant="outline" disabled={busy || !reason.trim()} onClick={() => send('INCOMPLETE')}>Mark Incomplete</Button>
          </div>
          <p className="text-xs text-slate-600">The tutor is told and can resubmit. Neither action verifies the class or counts any minutes.</p>
        </section>
      )}
    </div>
  );
}

// ─── Edit Schedule / Reschedule ──────────────────────────────────────────────────────────────────────────────────
/**
 * A native dialog (focus is kept inside it, Escape closes it). It calls the existing reschedule action, so the server checks the tutor's
 * availability and the student's other classes, keeps the original time on record, and sends the notification. Nothing changes until it replies.
 */
export function RescheduleDialog({ w, classKey, open, onClose, onDone }: { w: WorkspaceData; classKey: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const [d, setD] = React.useState<RescheduleDraft>(() => rescheduleDraftOf(w.class));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const today = React.useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) { setD(rescheduleDraftOf(w.class)); setError(null); if (typeof el.showModal === 'function') el.showModal(); else el.setAttribute('open', ''); }
    if (!open && el.open) el.close();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const problems = rescheduleProblems(d, w.class, today);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await mentoringApi('/mentoring/classes/reschedule', 'POST', reschedulePayload(classKey, d));
      setBusy(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The class could not be rescheduled.');
      setBusy(false);
    }
  };
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="reschedule-title" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg p-0 shadow-xl backdrop:bg-slate-900/50" data-testid="reschedule-dialog">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (problems.length === 0 && !busy) void save(); }} className="space-y-3 p-5">
        <h2 id="reschedule-title" className="text-lg font-semibold text-slate-900">Edit Schedule / Reschedule</h2>
        <p className="text-sm text-slate-700">Current time: {longDayLabel(w.class.date)}, {timeLabel(w.class)}. The original time stays on record. The tutor&apos;s availability and the student&apos;s other classes are checked, and the tutor is told.</p>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-800">New date</span><input type="date" min={today} className={FIELD} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-800">New start</span><input type="time" className={FIELD} value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-800">New end</span><input type="time" className={FIELD} value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} /></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-800">Reason</span><textarea className={FIELD} rows={2} maxLength={1000} value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></label>
        <label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" className={BOX} checked={d.confirmed} onChange={(e) => setD({ ...d, confirmed: e.target.checked })} />I confirm this class should move to the new time.</label>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {problems.length > 0 && <p className="text-xs text-slate-600">Still needed: {problems.join(', ')}.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={`inline-flex min-h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 ${FOCUS}`}>Cancel</button>
          <Button type="submit" disabled={busy || problems.length > 0}>{busy ? 'Saving' : 'Reschedule class'}</Button>
        </div>
      </form>
    </dialog>
  );
}

export { nextStep };
