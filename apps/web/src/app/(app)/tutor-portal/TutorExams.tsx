"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EXAM_TONE, ExamItem, examTime, marksPreview } from '../mentoring/exam-view';
import { longDayLabel } from '../mentoring/timetable-view';

import { tutorPortalApi } from './client';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500';

interface EvaluationDraft { obtained: string; max: string; evaluationDate: string; weaknesses: string; topicsToImprove: string; tutorSuggestions: string }
const draftOf = (e: ExamItem): EvaluationDraft => ({
  obtained: e.marks ? String(e.marks.obtained) : '', max: e.marks ? String(e.marks.max) : '', evaluationDate: e.marks?.evaluationDate ?? '',
  weaknesses: e.remarks.weaknesses ?? '', topicsToImprove: e.remarks.topicsToImprove ?? '', tutorSuggestions: e.remarks.tutorSuggestions ?? '',
});

/** The tutor's evaluation of one exam: the marks and the tutor's own remarks. The Mentor's remarks are not shown or editable here. */
export function EvaluationForm({ e, draft, busy = false, error = null, onChange, onSubmit, onCancel }: { e: ExamItem; draft: EvaluationDraft; busy?: boolean; error?: string | null; onChange: (d: EvaluationDraft) => void; onSubmit: () => void; onCancel: () => void }) {
  const set = <K extends keyof EvaluationDraft>(k: K, v: EvaluationDraft[K]) => onChange({ ...draft, [k]: v });
  const preview = marksPreview(draft.obtained, draft.max);
  return (
    <section aria-label="Exam evaluation" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="evaluation-form">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">Evaluation, {e.title}, {e.studentName}</h4>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Marks obtained</span><Input type="number" min={0} step="0.01" value={draft.obtained} onChange={(x) => set('obtained', x.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Maximum marks</span><Input type="number" min={0} step="0.01" value={draft.max} onChange={(x) => set('max', x.target.value)} /></label>
        <div className="text-sm"><span className="mb-1 block font-medium text-slate-700">Percentage</span><p className="rounded-md bg-white px-3 py-2 text-slate-900" data-testid="percentage">{preview.percentage !== null ? `${preview.percentage}%` : 'Worked out from the marks'}</p></div>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Evaluation date</span><Input type="date" value={draft.evaluationDate} onChange={(x) => set('evaluationDate', x.target.value)} /></label>
      </div>
      {preview.problem && <p role="alert" className="mt-1 text-xs text-red-600" data-testid="marks-problem">{preview.problem}</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {([['weaknesses', 'Areas of weakness'], ['topicsToImprove', 'Topics to improve'], ['tutorSuggestions', 'Your suggestions']] as const).map(([k, label]) => (
          <label key={k} className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span><textarea className={AREA} rows={3} value={draft[k]} onChange={(x) => set(k, x.target.value)} /></label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || preview.percentage === null} onClick={onSubmit}>Submit the evaluation</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="mt-1 text-xs text-slate-600">Submitting tells your Mentor the evaluation is complete. The Mentor records the rest.</p>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

export function MyExamCard({ e, busy = false, onReceipt, onEvaluate }: { e: ExamItem; busy?: boolean; onReceipt: () => void; onEvaluate: () => void }) {
  const sat = e.conducted === true;
  const receipt = e.items.find((i) => i.kind === 'TUTOR_RECEIPT');
  const evaluation = e.items.find((i) => i.kind === 'TUTOR_EVALUATION');
  return (
    <article aria-label={`${e.subjectName} exam ${e.date}`} className="rounded-md border border-slate-200 bg-white p-3" data-testid="my-exam" data-state={e.state}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-slate-900">{e.title}<span className="ml-2 font-normal text-slate-500">{e.subjectName}, {longDayLabel(e.date)}, {examTime(e)}</span></h3>
        {e.kind === 'RE_EXAM' && <Badge variant="info">Re-exam</Badge>}
        <Badge variant={EXAM_TONE[e.state]}>{e.stateLabel}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-700">{e.studentName}. Chapters: {e.chapters.join(', ')}.{e.portion ? ` Portion: ${e.portion}.` : ''}</p>
      {e.instructions && <p className="text-sm text-slate-700">Instructions: {e.instructions}</p>}
      {e.marks && <p className="mt-1 text-sm text-slate-900" data-testid="my-exam-marks">Marks: {e.marks.obtained} of {e.marks.max}, {e.marks.percentage}%</p>}
      {sat && (
        <div className="mt-2 flex flex-wrap gap-2">
          {receipt?.status !== 'DONE' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReceipt}>Confirm I received the paper</Button>}
          {receipt?.status === 'DONE' && evaluation?.status !== 'DONE' && <Button type="button" size="sm" disabled={busy} onClick={onEvaluate}>Evaluate the exam</Button>}
          {evaluation?.status === 'DONE' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onEvaluate}>Correct the evaluation</Button>}
        </div>
      )}
    </article>
  );
}

/** The signed-in tutor's own exams for a range, each with the steps that are theirs. */
export function MyExams({ from, to }: { from: string; to: string }) {
  const [exams, setExams] = React.useState<ExamItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<EvaluationDraft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setExams(await tutorPortalApi(`/tutor-portal/exams?from=${from}&to=${to}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Your exams could not be loaded.');
    }
  }, [from, to]);
  React.useEffect(() => { void load(); }, [load]);

  const run = async (go: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await go();
      setNotice(done);
      after?.();
      await load();
    } catch (e) {
      setFormError(e instanceof Error && e.message ? e.message : 'That could not be done.');
    }
    setBusy(false);
  };

  return (
    <section aria-label="My exams" className="space-y-2" data-testid="my-exams">
      <h2 className="text-base font-semibold text-slate-900">Exams</h2>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {formError && !open && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
      {exams && exams.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">You have no exams in these dates.</p>}
      {exams?.map((e) => (
        <div key={e.id} className="space-y-2">
          <MyExamCard e={e} busy={busy}
            onReceipt={() => void run(() => tutorPortalApi(`/tutor-portal/exams/${e.id}/receipt`, 'POST', {}), 'Your confirmation was sent to the Mentor.')}
            onEvaluate={() => { setFormError(null); setNotice(null); setDraft(draftOf(e)); setOpen(e.id); }} />
          {open === e.id && draft && (
            <EvaluationForm e={e} draft={draft} busy={busy} error={formError} onChange={setDraft} onCancel={() => setOpen(null)}
              onSubmit={() => void run(() => tutorPortalApi(`/tutor-portal/exams/${e.id}/evaluation`, 'PUT', {
                marksObtained: Number(draft.obtained), maxMarks: Number(draft.max), ...(draft.evaluationDate ? { evaluationDate: draft.evaluationDate } : {}),
                weaknesses: draft.weaknesses, topicsToImprove: draft.topicsToImprove, tutorSuggestions: draft.tutorSuggestions,
              }), 'Your evaluation was sent to the Mentor.', () => setOpen(null))} />
          )}
        </div>
      ))}
    </section>
  );
}
