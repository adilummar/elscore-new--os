"use client";

import * as React from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  RotateCcw,
  User,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  EXAM_TONE,
  ExamDraft,
  ExamItem,
  ITEM_STATUS_LABELS,
  REMARK_FIELDS,
  RemarksDraft,
  emptyExamDraft,
  examTime,
  marksPreview,
  payloadOfExam,
  remarksDraftOf,
  responsibleLabel,
} from './exam-view';
import { mentoringApi } from './mentoring-client';
import { dayLabel, longDayLabel } from './timetable-view';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const when = (iso: string) => `${dayLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;

export interface ExamDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamItem | null;
  canWork: boolean;
  busy?: boolean;
  error?: string | null;
  subjects?: Array<{ subjectId: string; subjectName: string }>;
  onRefresh?: () => Promise<void> | void;
  onRescheduleClick?: (exam: ExamItem) => void;
}

export function ExamDetailDrawer({
  isOpen,
  onClose,
  exam: e,
  canWork,
  busy: parentBusy = false,
  error: parentError = null,
  subjects = [],
  onRefresh,
  onRescheduleClick,
}: ExamDetailDrawerProps) {
  // Local state for Drawer
  const [internalExam, setInternalExam] = React.useState<ExamItem | null>(e);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // Marks state
  const [obtained, setObtained] = React.useState(e?.marks ? String(e.marks.obtained) : '');
  const [max, setMax] = React.useState(e?.marks ? String(e.marks.max) : '');
  const [evaluationDate, setEvaluationDate] = React.useState(e?.marks?.evaluationDate ?? '');
  const [changeReason, setChangeReason] = React.useState('');

  // Remarks state
  const [remarks, setRemarks] = React.useState<RemarksDraft>(() =>
    e ? remarksDraftOf(e.remarks) : { weaknesses: '', topicsToImprove: '', tutorSuggestions: '', mentorRemarks: '' },
  );

  // Conducted / Informed state
  const [notConducted, setNotConducted] = React.useState('');
  const [informed, setInformed] = React.useState('');

  // Re-exam state
  const [reExamReason, setReExamReason] = React.useState('');
  const [reExamDraft, setReExamDraft] = React.useState<ExamDraft>(() => emptyExamDraft());

  // Collapsible sections
  const [expandedItems, setExpandedItems] = React.useState<Record<string, boolean>>({});
  const [itemNotes, setItemNotes] = React.useState<Record<string, { remarks: string; responsible: string; evidenceRef: string }>>({});

  // Sync with prop changes
  React.useEffect(() => {
    setInternalExam(e);
    if (e) {
      setObtained(e.marks ? String(e.marks.obtained) : '');
      setMax(e.marks ? String(e.marks.max) : '');
      setEvaluationDate(e.marks?.evaluationDate ?? '');
      setChangeReason('');
      setRemarks(remarksDraftOf(e.remarks));
      setReExamReason(e.reExam.reason ?? '');
      setReExamDraft({
        ...emptyExamDraft(e.subjectId),
        title: `Re-exam: ${e.title}`,
        chaptersText: e.chapters.join('\n'),
        portion: e.portion ?? '',
        start: '',
        end: '',
      });
      setError(null);
      setNotice(null);
    }
  }, [e]);

  // Keyboard accessibility: ESC key to close
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll when open
  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen || !internalExam) return null;

  const current = internalExam;
  const base = `/mentoring/exams/${current.id}`;
  const notSat = current.conducted === null;
  const sat = current.conducted === true;
  const preview = marksPreview(obtained, max);

  const reloadExam = async () => {
    try {
      const updated: ExamItem = await mentoringApi(`/mentoring/exams/${current.id}`);
      setInternalExam(updated);
      setObtained(updated.marks ? String(updated.marks.obtained) : '');
      setMax(updated.marks ? String(updated.marks.max) : '');
      setEvaluationDate(updated.marks?.evaluationDate ?? '');
      setRemarks(remarksDraftOf(updated.remarks));
      setReExamReason(updated.reExam.reason ?? '');
      if (onRefresh) await onRefresh();
    } catch {
      // Keep existing state if refresh fails
    }
  };

  const call = async (path: string, method: 'POST' | 'PUT', body: unknown, doneMsg: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await mentoringApi(path, method, body);
      setNotice(doneMsg);
      await reloadExam();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  // Checklist quick toggle (tick / untick)
  const toggleItem = (kind: string, currentlyDone: boolean) => {
    const nextStatus = currentlyDone ? 'PENDING' : 'DONE';
    const note = itemNotes[kind] ?? { remarks: '', responsible: '', evidenceRef: '' };
    const payload = nextStatus === 'DONE' && (note.remarks || note.responsible || note.evidenceRef)
      ? { status: 'DONE', remarks: note.remarks || null, responsible: note.responsible || null, evidenceRef: note.evidenceRef || null }
      : { status: nextStatus };
    const label = current.items.find((i) => i.kind === kind)?.label ?? kind;
    void call(
      `${base}/items/${kind}`,
      'PUT',
      payload,
      nextStatus === 'DONE' ? `Recorded: ${label}.` : `Marked pending: ${label}.`,
    );
  };

  const toggleExpand = (kind: string) => {
    setExpandedItems((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  const noteOf = (k: string) => itemNotes[k] ?? { remarks: '', responsible: '', evidenceRef: '' };
  const setNote = (k: string, v: Partial<{ remarks: string; responsible: string; evidenceRef: string }>) =>
    setItemNotes((n) => ({ ...n, [k]: { ...noteOf(k), ...v } }));

  const postItems = current.items.filter((i) => i.list === 'POST_EXAM');
  const reItems = current.items.filter((i) => i.list === 'RE_EXAM');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-drawer-title"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
        <div
          className="w-screen max-w-2xl lg:max-w-3xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300"
          onClick={(ev) => ev.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
            <div className="min-w-0 pr-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  {current.subjectName}
                </span>
                {current.kind === 'RE_EXAM' && <Badge variant="info">Re-exam</Badge>}
                {current.date !== current.originalDate && <Badge variant="info">Moved</Badge>}
                <Badge variant={EXAM_TONE[current.state]} data-testid="drawer-exam-state">
                  {current.stateLabel}
                </Badge>
              </div>
              <h2 id="exam-drawer-title" className="mt-1 text-lg font-bold text-slate-900 truncate">
                {current.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <strong>Student:</strong> {current.studentName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {longDayLabel(current.date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  {examTime(current)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-label="Close drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Feedback Banners */}
            {notice && (
              <div role="status" className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{notice}</span>
              </div>
            )}
            {(error || parentError) && (
              <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{error || parentError}</span>
              </div>
            )}

            {/* Incomplete items callout */}
            {current.problems.length > 0 && current.state !== 'COMPLETED' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                <p className="font-semibold text-amber-950 mb-1">Still needed before this exam is complete:</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-900">
                  {current.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Overview Details Section */}
            <section aria-label="Exam Overview" className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Exam Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Chapters</dt>
                  <dd className="font-medium text-slate-900">{current.chapters.join(', ')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Responsible Person</dt>
                  <dd className="font-medium text-slate-900">{responsibleLabel(current.responsible)}</dd>
                </div>
                {current.portion && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Portion</dt>
                    <dd className="text-slate-800">{current.portion}</dd>
                  </div>
                )}
                {current.instructions && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Instructions</dt>
                    <dd className="text-slate-800">{current.instructions}</dd>
                  </div>
                )}
                {current.date !== current.originalDate && (
                  <div className="sm:col-span-2 rounded-md bg-amber-50/80 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                    <strong>Rescheduled:</strong> Originally scheduled for {longDayLabel(current.originalDate)}.
                  </div>
                )}
              </div>

              {/* Quick Actions (Reschedule, Reminder) for upcoming exams */}
              {canWork && notSat && (
                <div className="pt-2 flex flex-wrap gap-2 border-t border-slate-200">
                  {onRescheduleClick && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || parentBusy}
                      onClick={() => onRescheduleClick(current)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Reschedule exam
                    </Button>
                  )}
                  {current.responsible.type === 'TUTOR' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || parentBusy}
                      onClick={() =>
                        call(`/mentoring/exams/${current.id}/remind`, 'POST', {}, 'Reminder sent to the tutor.')
                      }
                    >
                      Send reminder to tutor
                    </Button>
                  )}
                </div>
              )}
            </section>

            {/* Conducted Confirmation Section */}
            {canWork && notSat && (
              <section aria-label="Exam Conducted Confirmation" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Exam Attendance & Sitting</h3>
                <p className="text-xs text-slate-600">
                  Confirm whether the exam was sat on {longDayLabel(current.date)}. You cannot mark an exam before its scheduled date.
                </p>

                {current.responsible.type !== 'TUTOR' && !current.informed && (
                  <div className="rounded-lg bg-slate-50 p-3 space-y-2">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700 block mb-1">
                        How and when you told {current.responsible.name ?? 'them'} about the exam:
                      </span>
                      <Input
                        placeholder="e.g., Phoned parent on Monday morning"
                        value={informed}
                        onChange={(x) => setInformed(x.target.value)}
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || !informed.trim()}
                      onClick={() =>
                        call(
                          `${base}/informed`,
                          'POST',
                          { note: informed },
                          'Recorded that you informed them directly.',
                        )
                      }
                    >
                      Record notification
                    </Button>
                  </div>
                )}

                {current.informed && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-md">
                    Notification recorded: {current.informed.note} ({when(current.informed.at)})
                  </p>
                )}

                <div className="space-y-2 pt-1">
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-slate-600 block mb-1">
                      If the exam was NOT conducted, state the reason:
                    </span>
                    <textarea
                      className={AREA}
                      rows={2}
                      placeholder="e.g., Student unwell, parent requested postponement"
                      value={notConducted}
                      onChange={(x) => setNotConducted(x.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        call(
                          `${base}/conducted`,
                          'POST',
                          { conducted: true },
                          'Recorded that the exam was conducted.',
                        )
                      }
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      The exam was conducted
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || !notConducted.trim()}
                      onClick={() =>
                        call(
                          `${base}/conducted`,
                          'POST',
                          { conducted: false, reason: notConducted },
                          'Recorded that the exam was not conducted.',
                        )
                      }
                    >
                      The exam was not conducted
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {current.conducted === false && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Exam was not conducted</p>
                <p className="text-xs text-slate-600 mt-1">Reason: {current.notConductedReason}</p>
              </div>
            )}

            {/* Post-Exam Workflow: Checklist, Marks, Remarks */}
            {sat && (
              <>
                {/* Simplified Post-Exam Checklist */}
                <section aria-label="Post-Exam Checklist" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">After the Exam Checklist</h3>
                      <p className="text-xs text-slate-500">
                        Tick routine items to confirm completion. Ticking automatically logs your ID and timestamp.
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-600">
                      {postItems.filter((i) => i.status === 'DONE').length} of {postItems.length} completed
                    </span>
                  </div>

                  <ul className="space-y-2" aria-label="Post-exam checklist">
                    {postItems.map((i) => {
                      const isDone = i.status === 'DONE';
                      const isNotApplicable = i.status === 'NOT_APPLICABLE';
                      const isExpanded = !!expandedItems[i.kind];

                      return (
                        <li
                          key={i.kind}
                          className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                          data-testid="exam-item"
                          data-status={i.status}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isDone}
                              disabled={!canWork || busy}
                              onChange={() => toggleItem(i.kind, isDone)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
                              aria-label={`Toggle ${i.label}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className={`text-sm font-medium ${isDone ? 'text-slate-900 line-through' : 'text-slate-800'}`}>
                                  {i.label}
                                </span>
                                <Badge variant={isDone ? 'success' : isNotApplicable ? 'default' : 'warning'}>
                                  {ITEM_STATUS_LABELS[i.status] ?? i.status}
                                </Badge>
                              </div>

                              {i.doneAt && (
                                <p className="text-xs text-slate-500 mt-1">
                                  Done {when(i.doneAt)}
                                  {i.responsible ? `, ${i.responsible}` : ''}
                                  {i.evidenceRef ? `, ${i.evidenceRef}` : ''}
                                  {i.remarks ? `. ${i.remarks}` : ''}
                                </p>
                              )}
                            </div>

                            {canWork && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(i.kind)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded"
                                title="Add notes or mark not applicable"
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            )}
                          </div>

                          {/* Optional details expansion for non-routine items */}
                          {canWork && isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-100 grid gap-2 sm:grid-cols-3">
                              <Input
                                aria-label={`${i.label}, person`}
                                placeholder="Done by"
                                value={noteOf(i.kind).responsible}
                                onChange={(x) => setNote(i.kind, { responsible: x.target.value })}
                              />
                              <Input
                                aria-label={`${i.label}, evidence`}
                                placeholder="Evidence reference"
                                value={noteOf(i.kind).evidenceRef}
                                onChange={(x) => setNote(i.kind, { evidenceRef: x.target.value })}
                              />
                              <Input
                                aria-label={`${i.label}, remarks`}
                                placeholder="Remarks"
                                value={noteOf(i.kind).remarks}
                                onChange={(x) => setNote(i.kind, { remarks: x.target.value })}
                              />
                              <div className="flex flex-wrap gap-2 sm:col-span-3 pt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    call(
                                      `${base}/items/${i.kind}`,
                                      'PUT',
                                      { status: 'DONE', ...noteOf(i.kind) },
                                      `Recorded: ${i.label}.`,
                                    )
                                  }
                                >
                                  Mark done
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || !noteOf(i.kind).remarks.trim()}
                                  onClick={() =>
                                    call(
                                      `${base}/items/${i.kind}`,
                                      'PUT',
                                      { status: 'NOT_APPLICABLE', ...noteOf(i.kind) },
                                      `Recorded as not applicable: ${i.label}.`,
                                    )
                                  }
                                >
                                  Not applicable
                                </Button>
                                {i.status !== 'PENDING' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() =>
                                      call(
                                        `${base}/items/${i.kind}`,
                                        'PUT',
                                        { status: 'PENDING' },
                                        `Taken back: ${i.label}.`,
                                      )
                                    }
                                  >
                                    Back to pending
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>

                {/* Marks and Evaluation Section */}
                <section aria-label="Marks Evaluation" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Marks and Evaluation</h3>
                  {current.marks && (
                    <div className="rounded-lg bg-emerald-50/70 border border-emerald-200 p-3 text-sm text-emerald-900" data-testid="exam-marks">
                      <p className="font-semibold">
                        {current.marks.obtained} of {current.marks.max} ({current.marks.percentage}%)
                      </p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        {current.marks.evaluatingTutorName ? `Evaluated by ${current.marks.evaluatingTutorName}` : 'Evaluated'}
                        {current.marks.evaluationDate ? ` on ${longDayLabel(current.marks.evaluationDate)}` : ''}
                      </p>
                    </div>
                  )}

                  {canWork && (
                    <div className="space-y-3 pt-1">
                      <div className="grid gap-2 sm:grid-cols-4">
                        <label className="block text-sm">
                          <span className="block text-xs font-medium text-slate-700 mb-1">Marks obtained</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={obtained}
                            onChange={(x) => setObtained(x.target.value)}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-xs font-medium text-slate-700 mb-1">Maximum marks</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={max}
                            onChange={(x) => setMax(x.target.value)}
                          />
                        </label>
                        <div className="text-sm">
                          <span className="block text-xs font-medium text-slate-700 mb-1">Percentage</span>
                          <p className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-slate-900 font-medium" data-testid="percentage">
                            {preview.percentage !== null ? `${preview.percentage}%` : 'Calculated'}
                          </p>
                        </div>
                        <label className="block text-sm">
                          <span className="block text-xs font-medium text-slate-700 mb-1">Evaluation date</span>
                          <Input
                            type="date"
                            value={evaluationDate}
                            onChange={(x) => setEvaluationDate(x.target.value)}
                          />
                        </label>
                      </div>

                      {preview.problem && (
                        <p role="alert" className="text-xs font-medium text-red-600" data-testid="marks-problem">
                          {preview.problem}
                        </p>
                      )}

                      {current.marks && (
                        <label className="block text-sm">
                          <span className="block text-xs font-medium text-slate-700 mb-1">
                            Reason for changing marks <span className="text-red-600">required</span>
                          </span>
                          <Input
                            value={changeReason}
                            placeholder="State why marks are being updated"
                            onChange={(x) => setChangeReason(x.target.value)}
                          />
                        </label>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || preview.percentage === null || (!!current.marks && !changeReason.trim())}
                        onClick={() =>
                          call(
                            `${base}/marks`,
                            'PUT',
                            {
                              marksObtained: Number(obtained),
                              maxMarks: Number(max),
                              ...(evaluationDate ? { evaluationDate } : {}),
                              ...(changeReason.trim() ? { reason: changeReason } : {}),
                            },
                            'Marks successfully saved.',
                          )
                        }
                      >
                        {current.marks ? 'Change the marks' : 'Save the marks'}
                      </Button>
                    </div>
                  )}
                </section>

                {/* Weekly Remarks Section */}
                <section aria-label="Weekly Remarks" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Weekly Remarks</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {REMARK_FIELDS.map(([k, label]) => (
                      <label key={k} className="block text-sm">
                        <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
                        <textarea
                          className={AREA}
                          rows={2}
                          disabled={!canWork}
                          value={remarks[k]}
                          onChange={(x) => setRemarks({ ...remarks, [k]: x.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                  {canWork && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => call(`${base}/remarks`, 'PUT', remarks, 'Remarks saved.')}
                    >
                      Save remarks
                    </Button>
                  )}
                </section>

                {/* Re-Exam Section */}
                {current.kind === 'EXAM' && (
                  <section aria-label="Re-Exam Requirement" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">Re-Exam</h3>
                    {!current.reExam.required && canWork && (
                      <div className="space-y-2">
                        <label className="block text-sm">
                          <span className="block text-xs font-medium text-slate-700 mb-1">Why a re-exam is required</span>
                          <Input
                            value={reExamReason}
                            placeholder="e.g. Scored below 50% passing threshold"
                            onChange={(x) => setReExamReason(x.target.value)}
                          />
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || !reExamReason.trim()}
                          onClick={() =>
                            call(
                              `${base}/re-exam`,
                              'POST',
                              { required: true, reason: reExamReason },
                              'A re-exam is now required.',
                            )
                          }
                        >
                          A re-exam is required
                        </Button>
                      </div>
                    )}

                    {!current.reExam.required && !canWork && (
                      <p className="text-xs text-slate-500">No re-exam is required.</p>
                    )}

                    {current.reExam.required && (
                      <div className="space-y-3">
                        <p className="text-sm text-red-700 font-medium">
                          A re-exam is required: {current.reExam.reason}
                        </p>
                        {reItems.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Re-exam checklist</h4>
                            <ul className="space-y-1.5" aria-label="Re-exam checklist">
                              {reItems.map((i) => (
                                <li key={i.kind} className="flex items-center justify-between text-xs p-2 rounded border border-slate-200" data-testid="exam-item" data-status={i.status}>
                                  <span>{i.label}</span>
                                  <Badge variant={i.status === 'DONE' ? 'success' : 'warning'}>{ITEM_STATUS_LABELS[i.status] ?? i.status}</Badge>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {canWork && !current.reExam.examId && (
                          <div className="pt-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                call(
                                  `${base}/re-exam`,
                                  'POST',
                                  { required: false, reason: reExamReason || 'Not needed after all' },
                                  'Re-exam requirement withdrawn.',
                                )
                              }
                            >
                              Withdraw re-exam requirement
                            </Button>
                          </div>
                        )}

                        {current.reExam.examId && (
                          <p className="text-xs text-slate-600">
                            Re-exam is scheduled for {longDayLabel(current.reExam.date ?? '')}. It is an independent exam record.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}

            {/* Audit History Timeline */}
            {(current.history ?? []).length > 0 && (
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold text-slate-800">
                  Audit History ({current.history?.length ?? 0} events)
                </summary>
                <ol className="mt-2 space-y-1.5 divide-y divide-slate-200/60">
                  {(current.history ?? []).map((h, idx) => (
                    <li key={`${h.kind}-${idx}`} className="pt-1.5 first:pt-0">
                      <span className="font-semibold text-slate-800 capitalize">
                        {h.kind.replace(/_/g, ' ').toLowerCase()}
                      </span>{' '}
                      — <span className="text-slate-500">{when(h.at)}</span>
                      {h.reason && <p className="text-slate-700 mt-0.5 font-sans">Reason: {h.reason}</p>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
