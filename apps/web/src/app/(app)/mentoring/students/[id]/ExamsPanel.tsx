"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  EXAM_STATE_CHOICES, EXAM_TONE, ExamDraft, ExamItem, ExamListData, ITEM_STATUS_LABELS, REMARK_FIELDS, RESPONSIBLE_CHOICES, RemarksDraft, draftOfExam, emptyExamDraft, examProblems, examTime, marksPreview, payloadOfExam, remarksDraftOf, responsibleLabel,
} from '../../exam-view';
import { mentoringApi } from '../../mentoring-client';
import { dayLabel, longDayLabel } from '../../timetable-view';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const when = (iso: string) => `${dayLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;

type Call = (label: string, path: string, method: 'POST' | 'PUT', body: unknown, done: string, after?: () => void) => void;

// ─── The schedule form ──────────────────────────────────────────────────────────────────────────────────────────
interface FormProps {
  subjects: ExamListData['subjects'];
  draft: ExamDraft;
  heading: string;
  lockSubject?: boolean;
  lockDate?: boolean;
  busy?: boolean;
  error?: string | null;
  submitLabel: string;
  onChange: (d: ExamDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ExamForm({ subjects, draft, heading, lockSubject = false, lockDate = false, busy = false, error = null, submitLabel, onChange, onSubmit, onCancel }: FormProps) {
  const set = <K extends keyof ExamDraft>(k: K, v: ExamDraft[K]) => onChange({ ...draft, [k]: v });
  const problems = examProblems(draft);
  return (
    <section aria-label={heading} className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="exam-form">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{heading}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Exam title <span className="text-red-600">required</span></span><Input value={draft.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Subject <span className="text-red-600">required</span></span>
          <Select value={draft.subjectId} disabled={lockSubject} onChange={(e) => set('subjectId', e.target.value)}><option value="">Choose a subject</option>{subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}</Select></label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">Chapters <span className="text-red-600">required</span></span>
          <textarea className={AREA} rows={2} value={draft.chaptersText} placeholder="One chapter to a line, or separated by commas. Several chapters of this subject are one exam." onChange={(e) => set('chaptersText', e.target.value)} /></label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">Portion</span><textarea className={AREA} rows={2} value={draft.portion} onChange={(e) => set('portion', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Date <span className="text-red-600">required</span></span><Input type="date" value={draft.date} disabled={lockDate} onChange={(e) => set('date', e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Start</span><Input type="time" value={draft.start} onChange={(e) => set('start', e.target.value)} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">End</span><Input type="time" value={draft.end} onChange={(e) => set('end', e.target.value)} /></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Person responsible</span>
          <Select value={draft.responsibleType} onChange={(e) => set('responsibleType', e.target.value)}>{RESPONSIBLE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        {draft.responsibleType !== 'TUTOR' && <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Their name <span className="text-red-600">required</span></span><Input value={draft.responsibleName} onChange={(e) => set('responsibleName', e.target.value)} /></label>}
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">Instructions</span><textarea className={AREA} rows={2} value={draft.instructions} onChange={(e) => set('instructions', e.target.value)} /></label>
      </div>
      <p className="mt-1 text-xs text-slate-600">A student can have only one exam on a date, whatever the subject. The server checks this when you save.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || problems.length > 0} onClick={onSubmit}>{submitLabel}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        {problems.length > 0 && <p className="text-xs text-slate-500" data-testid="exam-missing">Still needed: {problems.join(', ')}.</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

// ─── Moving an exam ─────────────────────────────────────────────────────────────────────────────────────────────
export function ExamRescheduleForm({ e, busy = false, error = null, onSubmit, onCancel }: { e: ExamItem; busy?: boolean; error?: string | null; onSubmit: (v: { newDate: string; newStart: string; newEnd: string; reason: string }) => void; onCancel: () => void }) {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const [v, setV] = React.useState({ newDate: e.date, newStart: clock(e.startMinute), newEnd: clock(e.endMinute), reason: '' });
  const same = v.newDate === e.date && v.newStart === clock(e.startMinute) && v.newEnd === clock(e.endMinute);
  return (
    <section aria-label="Reschedule exam" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="exam-reschedule">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">Reschedule {e.title}, now on {longDayLabel(e.date)}</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New date</span><Input type="date" value={v.newDate} onChange={(x) => setV({ ...v, newDate: x.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New start</span><Input type="time" value={v.newStart} onChange={(x) => setV({ ...v, newStart: x.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New end</span><Input type="time" value={v.newEnd} onChange={(x) => setV({ ...v, newEnd: x.target.value })} /></label>
      </div>
      <label className="mt-2 block text-sm"><span className="mb-1 block text-slate-700">Reason <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={v.reason} onChange={(x) => setV({ ...v, reason: x.target.value })} /></label>
      <p className="mt-1 text-xs text-slate-600">The original date is kept in the history, the one exam a day rule is checked again, and the tutor is told in the app. The parent or another person is told by you.</p>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || same || !v.reason.trim()} onClick={() => onSubmit(v)}>Move the exam</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

// ─── One exam ───────────────────────────────────────────────────────────────────────────────────────────────────
interface CardProps {
  e: ExamItem;
  canWork: boolean;
  busy?: boolean;
  onOpen: () => void;
  onSend: () => void;
  onReschedule: () => void;
  onEdit: () => void;
}

export function ExamCard({ e, canWork, busy = false, onOpen, onSend, onReschedule, onEdit }: CardProps) {
  const notSat = e.conducted === null;
  return (
    <article aria-label={`${e.subjectName} exam ${e.date}`} className="rounded-md border border-slate-200 bg-white p-3" data-testid="exam-card" data-state={e.state}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-slate-900">{e.title}<span className="ml-2 font-normal text-slate-500">{e.subjectName}</span></h3>
        {e.kind === 'RE_EXAM' && <Badge variant="info">Re-exam</Badge>}
        {e.date !== e.originalDate && <Badge variant="info">Moved</Badge>}
        <Badge variant={EXAM_TONE[e.state]} data-testid="exam-state">{e.stateLabel}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {([
          ['Date', `${longDayLabel(e.date)}, ${examTime(e)}`], ['Chapters', e.chapters.join(', ')], ['Person responsible', responsibleLabel(e.responsible)],
          ['Reminder', e.reminder ? (e.reminder.status === 'PREPARED' ? 'Prepared, not sent' : e.reminder.status === 'ACKNOWLEDGED' ? 'Sent and acknowledged' : 'Sent to the tutor') : e.informed ? 'Mentor told them' : 'Not sent'],
          ['Marks', e.marks ? `${e.marks.obtained} of ${e.marks.max}, ${e.marks.percentage}%` : 'Not recorded'],
        ] as Array<[string, string]>).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>)}
        {e.date !== e.originalDate && <div><dt className="text-xs text-slate-500">Original date</dt><dd className="text-slate-900">{longDayLabel(e.originalDate)}</dd></div>}
      </dl>
      {e.reExam.required && <p className="mt-1 text-xs text-red-700">{e.reExam.examId ? `Re-exam on ${longDayLabel(e.reExam.date ?? '')}.` : 'A re-exam is required and not yet scheduled.'} {e.reExam.reason}</p>}
      {e.conducted === false && <p className="mt-1 text-xs text-slate-700">Not conducted: {e.notConductedReason}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onOpen}>Open</Button>
        {canWork && notSat && e.responsible.type === 'TUTOR' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSend}>Send reminder</Button>}
        {canWork && notSat && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onEdit}>Change details</Button>}
        {canWork && notSat && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReschedule}>Reschedule</Button>}
      </div>
    </article>
  );
}

// ─── The detail: checklist, marks, remarks, re-exam, history ────────────────────────────────────────────────────
interface DetailProps { e: ExamItem; canWork: boolean; busy?: boolean; error?: string | null; subjects: ExamListData['subjects']; call: Call; onClose: () => void }

export function ExamDetail({ e, canWork, busy = false, error = null, subjects, call, onClose }: DetailProps) {
  const [obtained, setObtained] = React.useState(e.marks ? String(e.marks.obtained) : '');
  const [max, setMax] = React.useState(e.marks ? String(e.marks.max) : '');
  const [evaluationDate, setEvaluationDate] = React.useState(e.marks?.evaluationDate ?? '');
  const [changeReason, setChangeReason] = React.useState('');
  const [remarks, setRemarks] = React.useState<RemarksDraft>(remarksDraftOf(e.remarks));
  const [notConducted, setNotConducted] = React.useState('');
  const [informed, setInformed] = React.useState('');
  const [reExamReason, setReExamReason] = React.useState(e.reExam.reason ?? '');
  const [reExamDraft, setReExamDraft] = React.useState<ExamDraft>(() => ({ ...emptyExamDraft(e.subjectId), title: `Re-exam: ${e.title}`, chaptersText: e.chapters.join('\n'), portion: e.portion ?? '', start: '', end: '' }));
  const [itemNotes, setItemNotes] = React.useState<Record<string, { remarks: string; responsible: string; evidenceRef: string }>>({});
  const preview = marksPreview(obtained, max);
  const base = `/mentoring/exams/${e.id}`;
  const notSat = e.conducted === null;
  const sat = e.conducted === true;
  const noteOf = (k: string) => itemNotes[k] ?? { remarks: '', responsible: '', evidenceRef: '' };
  const setNote = (k: string, v: Partial<{ remarks: string; responsible: string; evidenceRef: string }>) => setItemNotes((n) => ({ ...n, [k]: { ...noteOf(k), ...v } }));
  const post = e.items.filter((i) => i.list === 'POST_EXAM');
  const re = e.items.filter((i) => i.list === 'RE_EXAM');
  const checklist = (rows: ExamItem['items'], label: string) => (
    <ul className="space-y-2" aria-label={label}>
      {rows.map((i) => (
        <li key={i.kind} className="rounded-md border border-slate-200 p-2 text-sm" data-testid="exam-item" data-status={i.status}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto font-medium text-slate-900">{i.label}</span>
            <Badge variant={i.status === 'DONE' ? 'success' : i.status === 'NOT_APPLICABLE' ? 'default' : 'warning'}>{ITEM_STATUS_LABELS[i.status] ?? i.status}</Badge>
          </div>
          {i.doneAt && <p className="text-xs text-slate-600">{when(i.doneAt)}{i.responsible ? `, ${i.responsible}` : ''}{i.evidenceRef ? `, ${i.evidenceRef}` : ''}{i.remarks ? `. ${i.remarks}` : ''}</p>}
          {canWork && sat && (
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              <Input aria-label={`${i.label}, person`} placeholder="Done by" value={noteOf(i.kind).responsible} onChange={(x) => setNote(i.kind, { responsible: x.target.value })} />
              <Input aria-label={`${i.label}, evidence`} placeholder="Evidence reference" value={noteOf(i.kind).evidenceRef} onChange={(x) => setNote(i.kind, { evidenceRef: x.target.value })} />
              <Input aria-label={`${i.label}, remarks`} placeholder="Remarks" value={noteOf(i.kind).remarks} onChange={(x) => setNote(i.kind, { remarks: x.target.value })} />
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call(i.kind, `${base}/items/${i.kind}`, 'PUT', { status: 'DONE', ...noteOf(i.kind) }, `Recorded: ${i.label}.`)}>Mark done</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || !noteOf(i.kind).remarks.trim()} onClick={() => call(i.kind, `${base}/items/${i.kind}`, 'PUT', { status: 'NOT_APPLICABLE', ...noteOf(i.kind) }, `Recorded as not applicable: ${i.label}.`)}>Not applicable</Button>
                {i.status !== 'PENDING' && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => call(i.kind, `${base}/items/${i.kind}`, 'PUT', { status: 'PENDING' }, `Taken back: ${i.label}.`)}>Back to pending</Button>}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Exam detail" className="space-y-3 rounded-md border border-brand-200 bg-white p-3" data-testid="exam-detail">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{e.title}, {e.subjectName}, {longDayLabel(e.date)}, {examTime(e)}</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {e.instructions && <p className="text-sm text-slate-700">Instructions: {e.instructions}</p>}
      {e.portion && <p className="text-sm text-slate-700">Portion: {e.portion}</p>}
      {e.problems.length > 0 && e.state !== 'COMPLETED' && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><p className="mb-0.5 font-medium">Still needed before this exam is complete</p><ul role="list" aria-label="Still needed">{e.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}

      {canWork && notSat && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          {e.responsible.type !== 'TUTOR' && !e.informed && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">How and when you told {e.responsible.name ?? 'them'} about the exam</span><Input value={informed} onChange={(x) => setInformed(x.target.value)} /></label>
              <div className="flex items-end"><Button type="button" size="sm" variant="outline" disabled={busy || !informed.trim()} onClick={() => call('informed', `${base}/informed`, 'POST', { note: informed }, 'Recorded that you told them. This is your word, not a delivery.')}>Record that I told them</Button></div>
            </div>
          )}
          {e.informed && <p className="text-sm text-slate-700">You recorded that you told them: {e.informed.note}</p>}
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">If the exam was not conducted, why</span><textarea className={AREA} rows={2} value={notConducted} onChange={(x) => setNotConducted(x.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => call('conducted', `${base}/conducted`, 'POST', { conducted: true }, 'Recorded that the exam was conducted.')}>The exam was conducted</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || !notConducted.trim()} onClick={() => call('conducted', `${base}/conducted`, 'POST', { conducted: false, reason: notConducted }, 'Recorded that the exam was not conducted.')}>The exam was not conducted</Button>
          </div>
        </div>
      )}

      {sat && (
        <>
          <div><h4 className="mb-1 text-sm font-semibold text-slate-900">After the exam</h4>{checklist(post, 'Post-exam checklist')}</div>

          <div className="rounded-md border border-slate-200 p-3">
            <h4 className="mb-1 text-sm font-semibold text-slate-900">Marks</h4>
            {e.marks && <p className="mb-1 text-sm text-slate-700" data-testid="exam-marks">{e.marks.obtained} of {e.marks.max}, {e.marks.percentage}%{e.marks.evaluatingTutorName ? `, evaluated by ${e.marks.evaluatingTutorName}` : ''}{e.marks.evaluationDate ? ` on ${longDayLabel(e.marks.evaluationDate)}` : ''}</p>}
            {canWork && (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="block text-sm"><span className="mb-1 block text-slate-700">Marks obtained</span><Input type="number" min={0} step="0.01" value={obtained} onChange={(x) => setObtained(x.target.value)} /></label>
                  <label className="block text-sm"><span className="mb-1 block text-slate-700">Maximum marks</span><Input type="number" min={0} step="0.01" value={max} onChange={(x) => setMax(x.target.value)} /></label>
                  <div className="text-sm"><span className="mb-1 block text-slate-700">Percentage</span><p className="rounded-md bg-slate-50 px-3 py-2 text-slate-900" data-testid="percentage">{preview.percentage !== null ? `${preview.percentage}%` : 'Worked out from the marks'}</p></div>
                  <label className="block text-sm"><span className="mb-1 block text-slate-700">Evaluation date</span><Input type="date" value={evaluationDate} onChange={(x) => setEvaluationDate(x.target.value)} /></label>
                </div>
                {preview.problem && <p role="alert" className="mt-1 text-xs text-red-600" data-testid="marks-problem">{preview.problem}</p>}
                {e.marks && <label className="mt-2 block text-sm"><span className="mb-1 block text-slate-700">Why the marks are being changed <span className="text-red-600">required</span></span><Input value={changeReason} onChange={(x) => setChangeReason(x.target.value)} /></label>}
                <div className="mt-2"><Button type="button" size="sm" variant="outline" disabled={busy || preview.percentage === null || (!!e.marks && !changeReason.trim())} onClick={() => call('marks', `${base}/marks`, 'PUT', { marksObtained: Number(obtained), maxMarks: Number(max), ...(evaluationDate ? { evaluationDate } : {}), ...(changeReason.trim() ? { reason: changeReason } : {}) }, 'Marks saved.')}>{e.marks ? 'Change the marks' : 'Save the marks'}</Button></div>
              </>
            )}
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <h4 className="mb-1 text-sm font-semibold text-slate-900">Remarks</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {REMARK_FIELDS.map(([k, label]) => (
                <label key={k} className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span><textarea className={AREA} rows={2} disabled={!canWork} value={remarks[k]} onChange={(x) => setRemarks({ ...remarks, [k]: x.target.value })} /></label>
              ))}
            </div>
            {canWork && <div className="mt-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call('remarks', `${base}/remarks`, 'PUT', remarks, 'Remarks saved.')}>Save remarks</Button></div>}
          </div>

          {e.kind === 'EXAM' && (
            <div className="rounded-md border border-slate-200 p-3">
              <h4 className="mb-1 text-sm font-semibold text-slate-900">Re-exam</h4>
              {!e.reExam.required && canWork && (
                <div className="space-y-2">
                  <label className="block text-sm"><span className="mb-1 block text-slate-700">Why a re-exam is needed</span><Input value={reExamReason} onChange={(x) => setReExamReason(x.target.value)} /></label>
                  <Button type="button" size="sm" variant="outline" disabled={busy || !reExamReason.trim()} onClick={() => call('reexam', `${base}/re-exam`, 'POST', { required: true, reason: reExamReason }, 'A re-exam is now required for this exam.')}>A re-exam is required</Button>
                </div>
              )}
              {!e.reExam.required && !canWork && <p className="text-sm text-slate-500">No re-exam is required.</p>}
              {e.reExam.required && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">A re-exam is required: {e.reExam.reason}</p>
                  {re.length > 0 && <div>{checklist(re, 'Re-exam checklist')}</div>}
                  {canWork && !e.reExam.examId && (
                    <>
                      <ExamForm subjects={subjects} draft={reExamDraft} heading="Schedule the re-exam" lockSubject submitLabel="Schedule the re-exam" busy={busy} error={error} onChange={setReExamDraft} onCancel={() => undefined}
                        onSubmit={() => call('reexam', `${base}/re-exam/schedule`, 'POST', payloadOfExam(reExamDraft), 'The re-exam is scheduled.')} />
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => call('reexam', `${base}/re-exam`, 'POST', { required: false, reason: reExamReason || 'Not needed after all' }, 'The re-exam requirement was withdrawn.')}>A re-exam is not needed after all</Button>
                    </>
                  )}
                  {e.reExam.examId && <p className="text-sm text-slate-700">The re-exam is on {longDayLabel(e.reExam.date ?? '')}. It is an exam of its own, with its own marks.</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      {(e.history ?? []).length > 0 && (
        <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">History</summary>
          <ol className="mt-1 space-y-0.5">{(e.history ?? []).map((h, i) => <li key={`${h.kind}-${i}`}>{h.kind.replace(/_/g, ' ').toLowerCase()}, {when(h.at)}{h.reason ? `: ${h.reason}` : ''}</li>)}</ol>
        </details>
      )}
    </section>
  );
}

// ─── The page section ───────────────────────────────────────────────────────────────────────────────────────────
/** Weekly exams for one student: scheduling, reminders, what happens after the exam, marks, remarks and re-exams. */
export function ExamsPanel({ activationId }: { activationId: string }) {
  const [subjectId, setSubjectId] = React.useState('');
  const [state, setState] = React.useState('');
  const [kind, setKind] = React.useState('');
  const [data, setData] = React.useState<ExamListData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState<ExamDraft | null>(null);
  const [editing, setEditing] = React.useState<{ e: ExamItem; draft: ExamDraft } | null>(null);
  const [moving, setMoving] = React.useState<ExamItem | null>(null);
  const [open, setOpen] = React.useState<ExamItem | null>(null);
  const base = `/mentoring/students/${activationId}/exams`;
  const query = `?${[subjectId && `subjectId=${encodeURIComponent(subjectId)}`, state && `state=${state}`, kind && `kind=${kind}`].filter(Boolean).join('&')}`;

  const load = React.useCallback(async () => {
    try {
      setData(await mentoringApi(`${base}${query}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The exams could not be loaded.');
    }
  }, [base, query]);
  React.useEffect(() => { void load(); }, [load]);

  const refreshOpen = async () => {
    if (open) setOpen(await mentoringApi(`/mentoring/exams/${open.id}`));
  };
  const act = async (label: string, run: () => Promise<unknown>, done: string, after?: () => Promise<void> | void) => {
    setBusy(label);
    setActionError(null);
    setNotice(null);
    try {
      await run();
      setNotice(done);
      await load();
      if (after) await after();
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'That could not be done.');
    }
    setBusy(null);
  };
  const call: Call = (label, path, method, body, done, after) => void act(label, () => mentoringApi(path, method, body), done, async () => { await refreshOpen(); after?.(); });
  const openExam = async (e: ExamItem) => {
    setActionError(null);
    try {
      setOpen(await mentoringApi(`/mentoring/exams/${e.id}`));
    } catch (x) {
      setActionError(x instanceof Error ? x.message : 'The exam could not be opened.');
    }
  };

  const canWork = data?.canWork ?? false;
  const filtered = Boolean(subjectId || state || kind);
  return (
    <section aria-label="Weekly exams" className="space-y-3" data-testid="exams-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-slate-900">{data ? `${data.student.name}, weekly exams` : 'Weekly exams'}</h2>
        {canWork && !creating && <Button type="button" size="sm" onClick={() => { setActionError(null); setCreating(emptyExamDraft()); }}>Schedule an exam</Button>}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
        <label className="text-sm"><span className="sr-only">Subject</span><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">All subjects</option>{(data?.subjects ?? []).map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}</Select></label>
        <label className="text-sm"><span className="sr-only">Exam status</span><Select value={state} onChange={(e) => setState(e.target.value)}><option value="">Any status</option>{EXAM_STATE_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        <label className="text-sm"><span className="sr-only">Exam or re-exam</span><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Exams and re-exams</option><option value="EXAM">Exams</option><option value="RE_EXAM">Re-exams</option></Select></label>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {actionError && !creating && !editing && !moving && !open && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      {creating && data && (
        <ExamForm subjects={data.subjects} draft={creating} heading="Schedule an exam" submitLabel="Schedule the exam" busy={busy !== null} error={actionError} onChange={setCreating} onCancel={() => setCreating(null)}
          onSubmit={() => void act('create', () => mentoringApi(base, 'POST', payloadOfExam(creating)), 'The exam is scheduled.', () => setCreating(null))} />
      )}
      {editing && data && (
        <ExamForm subjects={data.subjects} draft={editing.draft} heading="Change the exam details" lockSubject lockDate submitLabel="Save the changes" busy={busy !== null} error={actionError} onChange={(d) => setEditing({ ...editing, draft: d })} onCancel={() => setEditing(null)}
          onSubmit={() => void act('edit', () => mentoringApi(`/mentoring/exams/${editing.e.id}`, 'PUT', payloadOfExam(editing.draft)), 'The exam details are saved.', () => setEditing(null))} />
      )}
      {!data && !error && <p className="text-sm text-slate-500">Loading the exams</p>}
      {data && data.exams.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500" data-testid="no-exams">{filtered ? 'No exams match these filters.' : 'No exam has been scheduled for this student.'}</p>}
      <div className="space-y-2">
        {data?.exams.map((e) => (
          <ExamCard key={e.id} e={e} canWork={canWork} busy={busy !== null} onOpen={() => void openExam(e)}
            onSend={() => void act(e.id, () => mentoringApi(`/mentoring/exams/${e.id}/remind`, 'POST', {}), 'Reminder sent to the tutor.')}
            onReschedule={() => { setActionError(null); setMoving(e); }} onEdit={() => { setActionError(null); setEditing({ e, draft: draftOfExam(e) }); }} />
        ))}
      </div>
      {moving && (
        <ExamRescheduleForm e={moving} busy={busy !== null} error={actionError} onCancel={() => setMoving(null)}
          onSubmit={(v) => void act(moving.id, () => mentoringApi(`/mentoring/exams/${moving.id}/reschedule`, 'POST', v), 'The exam was moved and the tutor was told.', () => setMoving(null))} />
      )}
      {open && data && <ExamDetail key={`${open.id}-${open.history?.length ?? 0}-${open.state}`} e={open} canWork={canWork} busy={busy !== null} error={actionError} subjects={data.subjects} call={call} onClose={() => setOpen(null)} />}
    </section>
  );
}
