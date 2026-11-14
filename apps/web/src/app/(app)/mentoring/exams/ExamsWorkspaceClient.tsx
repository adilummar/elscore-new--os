"use client";

import * as React from 'react';
import Link from 'next/link';
import { Calendar, Check, Clock, Minus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';

import { EXAM_TONE, ExamDraft, ExamItem, emptyExamDraft, examTime, payloadOfExam } from '../exam-view';
import { ExamDetailDrawer } from '../ExamDetailDrawer';
import {
  DUE_STATUS_TEXT,
  DueData,
  DueRow,
  EXAM_QUEUES,
  ExamWorkspaceData,
  PRIMARY_EXAM_TABS,
  PrimaryExamTab,
  dueQuery,
  dueReason,
  dueStatus,
  evaluationText,
  examsInQueue,
  parentSharingText,
  queueCount,
  tabCount,
  workspaceQuery,
} from '../exams-view';
import { mentoringApi } from '../mentoring-client';
import {
  Empty,
  FIELD_LABEL,
  FOCUS,
  ListSkeleton,
  Notice,
  PANEL,
  PageHeader,
  ProgressBar,
  QueueTabs,
  StatusChip,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  THEAD,
  TR,
  chipTone,
  linkButton,
} from '../mentoring-ui';
import { ExamForm, ExamRescheduleForm } from '../students/[id]/ExamsPanel';
import { longDayLabel } from '../timetable-view';

const TONE_STYLE = { done: 'text-emerald-800', waiting: 'text-slate-700', none: 'text-slate-500' } as const;
const TONE_ICON = { done: Check, waiting: Clock, none: Minus } as const;

function Status({ s }: { s: { tone: 'done' | 'waiting' | 'none'; text: string } }) {
  const Icon = TONE_ICON[s.tone];
  return (
    <span className={`inline-flex items-start gap-1.5 ${TONE_STYLE[s.tone]}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{s.text}</span>
    </span>
  );
}

const hm = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;
const examHref = (activationId: string) => `/mentoring/exams/${encodeURIComponent(activationId)}`;

interface DueCardProps {
  r: DueRow;
  onScheduleClick: (r: DueRow) => void;
}

function DueCard({ r, onScheduleClick }: DueCardProps) {
  const s = dueStatus(r);
  return (
    <li className={`${PANEL} p-4 ${r.due ? 'border-l-4 border-l-amber-600' : ''}`} data-testid="due-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{r.studentName}</p>
          <p className="text-sm text-slate-700">{r.subjectName}</p>
        </div>
        <StatusChip tone={s === 'due' ? 'warning' : s === 'counting' ? 'neutral' : 'info'}>
          {DUE_STATUS_TEXT[s]}
        </StatusChip>
      </div>
      <div className="mt-3">
        <ProgressBar
          percent={r.progressPercent}
          tone={r.due ? 'amber' : 'brand'}
          label={`Verified class time for ${r.studentName}, ${r.subjectName}`}
        />
        <p className="mt-1 text-xs text-slate-700">{hm(r.verifiedMinutes)} of {r.thresholdMinutes / 60} h</p>
      </div>
      <p className="mt-2 text-sm text-slate-700">{dueReason(r)}</p>
      {r.scheduledExam && (
        <p className="mt-1 text-xs font-medium text-brand-700">
          Next scheduled exam: {longDayLabel(r.scheduledExam.date)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {s === 'due' ? (
          <Button type="button" size="sm" onClick={() => onScheduleClick(r)}>
            Schedule Exam
          </Button>
        ) : (
          <Link href={examHref(r.activationId)} className={linkButton('secondary', true)}>
            Manage exams
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Exams workspace: distinct sections for Needing Scheduling (3-hour threshold), Upcoming Scheduled,
 * Rescheduled, Requiring Follow-up, and Completed exams. Clicking Open triggers a right slide-over Drawer.
 */
export function ExamsWorkspaceClient() {
  const [tab, setTab] = React.useState<string>('due');
  const [followupFilter, setFollowupFilter] = React.useState<string>('all');
  const [subjectId, setSubjectId] = React.useState('');
  const [student, setStudent] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [due, setDue] = React.useState<DueData | null>(null);
  const [list, setList] = React.useState<ExamWorkspaceData | null>(null);
  const [subjects, setSubjects] = React.useState<Map<string, string>>(new Map());
  const [error, setError] = React.useState<string | null>(null);

  // Drawer and Dialog state
  const [drawerExam, setDrawerExam] = React.useState<ExamItem | null>(null);
  const [rescheduleExam, setRescheduleExam] = React.useState<ExamItem | null>(null);
  const [schedulingDue, setSchedulingDue] = React.useState<DueRow | null>(null);
  const [scheduleDraft, setScheduleDraft] = React.useState<ExamDraft>(() => emptyExamDraft());
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(student), 300);
    return () => clearTimeout(t);
  }, [student]);

  const load = React.useCallback(async () => {
    try {
      const [d, l]: [DueData, ExamWorkspaceData] = await Promise.all([
        mentoringApi(`/mentoring/exams/due${dueQuery({ subjectId, student: debounced })}`),
        mentoringApi(`/mentoring/exams${workspaceQuery({ subjectId, student: debounced, from: '', to: '' })}`),
      ]);
      setDue(d);
      setList(l);
      setSubjects((k) => {
        const m = new Map(k);
        for (const r of d.rows) m.set(r.subjectId, r.subjectName);
        for (const e of l.exams) m.set(e.subjectId, e.subjectName);
        return m;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The exams could not be loaded.');
    }
  }, [subjectId, debounced]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openDrawer = async (e: ExamItem) => {
    try {
      const full: ExamItem = await mentoringApi(`/mentoring/exams/${e.id}`);
      setDrawerExam(full);
    } catch {
      setDrawerExam(e);
    }
  };

  const handleStartSchedule = (r: DueRow) => {
    setSchedulingDue(r);
    setActionError(null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);
    setScheduleDraft({
      ...emptyExamDraft(r.subjectId, tomorrowIso, 60),
      title: `${r.subjectName} Assessment`,
    });
  };

  const handleSaveSchedule = async () => {
    if (!schedulingDue) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await mentoringApi(
        `/mentoring/students/${schedulingDue.activationId}/exams`,
        'POST',
        payloadOfExam(scheduleDraft),
      );
      setSchedulingDue(null);
      await load();
      setTab('upcoming');
    } catch (err) {
      setActionError(err instanceof Error && err.message ? err.message : 'Could not schedule exam.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveReschedule = async (v: { newDate: string; newStart: string; newEnd: string; reason: string }) => {
    if (!rescheduleExam) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await mentoringApi(`/mentoring/exams/${rescheduleExam.id}/reschedule`, 'POST', v);
      setRescheduleExam(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error && err.message ? err.message : 'Could not reschedule exam.');
    } finally {
      setActionBusy(false);
    }
  };

  const dueNow = due ? due.rows.filter((r) => r.due) : [];
  const primaryTab = PRIMARY_EXAM_TABS.find((t) => t.key === tab);

  // Filter exams based on current primary section and sub-filters
  const getShownExams = (): ExamItem[] => {
    if (!list) return [];
    if (tab === 'due') return [];
    if (tab === 'upcoming') {
      return list.exams.filter((e) => ['SCHEDULED', 'REMINDER_PENDING', 'READY_FOR_EXAM'].includes(e.state));
    }
    if (tab === 'rescheduled') {
      return list.exams.filter((e) => e.state === 'RESCHEDULED');
    }
    if (tab === 'followup') {
      const followups = list.exams.filter((e) =>
        ['EXAM_COMPLETED', 'AWAITING_PAPER_COLLECTION', 'AWAITING_EVALUATION', 'MARKS_PENDING', 'AWAITING_PARENT_SHARING', 'RE_EXAM_REQUIRED'].includes(e.state),
      );
      if (followupFilter === 'all') return followups;
      const subQueue = EXAM_QUEUES.find((q) => q.key === followupFilter);
      return subQueue ? examsInQueue(subQueue, followups) : followups;
    }
    if (tab === 'completed') {
      return list.exams.filter((e) => e.state === 'COMPLETED');
    }
    return list.exams;
  };

  const exams = getShownExams();
  const filtered = subjectId || student;

  const tabs = PRIMARY_EXAM_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count: list ? tabCount(t, list.counts, due ? dueNow.length : 0) : undefined,
    urgent: t.key === 'due' && dueNow.length > 0,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="exams-workspace">
      <PageHeader
        title="Exams"
        subtitle="An exam is due after 3 hours of Mentor-verified classes in a subject since the last exam that was conducted. Scheduling or moving an exam does not restart that count."
      />

      {/* Filter Bar */}
      <section aria-label="Filters" className={`${PANEL} p-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className={FIELD_LABEL}>Student name</span>
            <Input type="search" value={student} onChange={(e) => setStudent(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className={FIELD_LABEL}>Subject</span>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All subjects</option>
              {[...subjects].map(([id, n]) => (
                <option key={id} value={id}>{n}</option>
              ))}
            </Select>
          </label>
          {filtered ? (
            <div className="flex items-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => { setStudent(''); setSubjectId(''); }}>
                Clear the filters
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Primary Section Tabs */}
      <QueueTabs label="Exam queues" value={tab} onChange={setTab} items={tabs} />

      {error && (
        <Notice tone="error">
          {error}{' '}
          <button type="button" className={`rounded font-semibold underline ${FOCUS}`} onClick={() => void load()}>
            Try again
          </button>
        </Notice>
      )}
      {!due && !error && <ListSkeleton rows={3} label="Loading the exams" />}

      {/* ─── SECTION 1: Needs Scheduling (Due now) ────────────────────────────────── */}
      {due && tab === 'due' && (
        <>
          {dueNow.length === 0 && (
            <Empty title={`No student is due an exam ${filtered ? 'with these filters' : 'right now'}`} testId="no-due">
              The list below shows every student and subject, with how close each is to the 3-hour threshold.
            </Empty>
          )}

          <div className={`${TABLE_WRAP} hidden xl:block`}>
            <table className={TABLE} data-testid="due-table">
              <caption className="sr-only">Students and subjects, with verified class time toward the next exam</caption>
              <thead className={THEAD}>
                <tr>
                  {['Student', 'Subject', 'Verified class time', 'Status', 'Why', ''].map((h, i) => (
                    <th key={`${h}-${i}`} scope="col" className={TH}>{h || <span className="sr-only">Actions</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {due.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-slate-600">No Active student has a subject to count yet.</td>
                  </tr>
                )}
                {due.rows.map((r) => {
                  const s = dueStatus(r);
                  return (
                    <tr key={`${r.activationId}-${r.subjectId}`} className={TR} data-testid="due-row" data-due={r.due}>
                      <td className={`${TD} font-medium text-slate-900 ${r.due ? 'shadow-[inset_3px_0_0_0_#d97706]' : ''}`}>
                        {r.studentName}
                      </td>
                      <td className={TD}>{r.subjectName}</td>
                      <td className={TD}>
                        <div className="min-w-[11rem]">
                          <ProgressBar
                            percent={r.progressPercent}
                            tone={r.due ? 'amber' : 'brand'}
                            label={`Verified class time for ${r.studentName}, ${r.subjectName}`}
                          />
                          <p className="mt-1 text-xs text-slate-700">{hm(r.verifiedMinutes)} of {r.thresholdMinutes / 60} h</p>
                        </div>
                      </td>
                      <td className={TD}>
                        <StatusChip tone={s === 'due' ? 'warning' : s === 'counting' ? 'neutral' : 'info'}>
                          {DUE_STATUS_TEXT[s]}
                        </StatusChip>
                        {r.scheduledExam && (
                          <div className="mt-1 text-xs text-slate-700">Exam on {longDayLabel(r.scheduledExam.date)}</div>
                        )}
                      </td>
                      <td className={`${TD} max-w-xs text-slate-700`}>{dueReason(r)}</td>
                      <td className={`${TD} text-right space-x-2`}>
                        {s === 'due' ? (
                          <Button type="button" size="sm" onClick={() => handleStartSchedule(r)}>
                            Schedule exam
                          </Button>
                        ) : (
                          <Link href={examHref(r.activationId)} className={linkButton('secondary')}>
                            Manage exams
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 xl:hidden" aria-label="Students and subjects">
            {due.rows.map((r) => (
              <DueCard key={`${r.activationId}-${r.subjectId}`} r={r} onScheduleClick={handleStartSchedule} />
            ))}
          </ul>
        </>
      )}

      {/* ─── SECTIONS 2, 3, 4, 5: Scheduled, Rescheduled, Follow-up, Completed ────── */}
      {list && tab !== 'due' && primaryTab && (
        <>
          {/* Sub-filter chips for Requiring Follow-up */}
          {tab === 'followup' && (
            <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <span className="font-semibold text-slate-600 px-1">Stage filter:</span>
              {[
                { key: 'all', label: 'All Follow-up' },
                { key: 'paper', label: 'Paper Collection' },
                { key: 'evaluation', label: 'Tutor Evaluation' },
                { key: 'marks', label: 'Marks Pending' },
                { key: 'parent', label: 'Parent Sharing' },
                { key: 'reexam', label: 'Re-exams' },
              ].map((sub) => (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => setFollowupFilter(sub.key)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    followupFilter === sub.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}

          {exams.length === 0 ? (
            <Empty
              title={`No exams in ${primaryTab.label.toLowerCase()} ${filtered ? 'with these filters' : 'right now'}`}
              testId="no-exams"
            >
              Choose another queue, or open a student from Needs Scheduling to schedule an exam.
            </Empty>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className={`${TABLE_WRAP} hidden xl:block`}>
                <table className={TABLE} data-testid="exam-table">
                  <caption className="sr-only">{primaryTab.label} exams</caption>
                  <thead className={THEAD}>
                    <tr>
                      {['Date and time', 'Student', 'Subject', 'Exam', 'Status', 'Evaluation and marks', 'Parent sharing', ''].map((h, i) => (
                        <th key={`${h}-${i}`} scope="col" className={TH}>{h || <span className="sr-only">Actions</span>}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exams.map((e) => (
                      <tr key={e.id} className={TR} data-testid="exam-row" data-state={e.state}>
                        <td className={`${TD} whitespace-nowrap`}>
                          <div className="font-medium text-slate-900">{longDayLabel(e.date)}</div>
                          <div className="text-xs text-slate-700">
                            {examTime(e)}
                            {e.date !== e.originalDate ? `, moved from ${longDayLabel(e.originalDate)}` : ''}
                          </div>
                        </td>
                        <td className={`${TD} font-medium text-slate-900`}>{e.studentName}</td>
                        <td className={TD}>{e.subjectName}</td>
                        <td className={TD}>
                          {e.title}
                          {e.kind === 'RE_EXAM' ? <span className="ml-1 text-xs text-slate-700">(re-exam)</span> : null}
                        </td>
                        <td className={TD}>
                          <StatusChip tone={chipTone(EXAM_TONE[e.state])}>{e.stateLabel}</StatusChip>
                        </td>
                        <td className={TD}><Status s={evaluationText(e)} /></td>
                        <td className={TD}><Status s={parentSharingText(e)} /></td>
                        <td className={`${TD} text-right space-x-2 whitespace-nowrap`}>
                          {(tab === 'upcoming' || tab === 'rescheduled') && e.conducted === null && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActionError(null);
                                setRescheduleExam(e);
                              }}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reschedule
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void openDrawer(e)}
                            aria-label={`Open the exam of ${e.studentName}`}
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <ul className="space-y-3 xl:hidden" aria-label="Exams">
                {exams.map((e) => (
                  <li key={e.id} className={`${PANEL} p-4`} data-testid="exam-card">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{e.studentName}</p>
                        <p className="text-sm text-slate-700">{e.subjectName}: {e.title}</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{longDayLabel(e.date)}, {examTime(e)}</p>
                      </div>
                      <StatusChip tone={chipTone(EXAM_TONE[e.state])}>{e.stateLabel}</StatusChip>
                    </div>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-600">Evaluation and marks</dt>
                        <dd><Status s={evaluationText(e)} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-600">Parent sharing</dt>
                        <dd><Status s={parentSharingText(e)} /></dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(tab === 'upcoming' || tab === 'rescheduled') && e.conducted === null && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionError(null);
                            setRescheduleExam(e);
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Reschedule
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void openDrawer(e)}
                        aria-label={`Open the exam of ${e.studentName}`}
                      >
                        Open
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* ─── Schedule Exam Modal for Due Students ────────────────────────────── */}
      {schedulingDue && (
        <Modal
          isOpen={schedulingDue !== null}
          onClose={() => setSchedulingDue(null)}
          size="lg"
        >
          <div className="p-1">
            <ExamForm
              subjects={[{ subjectId: schedulingDue.subjectId, subjectName: schedulingDue.subjectName }]}
              draft={scheduleDraft}
              heading={`Schedule Exam for ${schedulingDue.studentName}`}
              lockSubject
              submitLabel="Schedule the exam"
              busy={actionBusy}
              error={actionError}
              onChange={setScheduleDraft}
              onCancel={() => setSchedulingDue(null)}
              onSubmit={() => void handleSaveSchedule()}
            />
          </div>
        </Modal>
      )}

      {/* ─── Reschedule Form Modal ───────────────────────────────────────────── */}
      {rescheduleExam && (
        <Modal
          isOpen={rescheduleExam !== null}
          onClose={() => setRescheduleExam(null)}
          size="md"
        >
          <div className="p-1">
            <ExamRescheduleForm
              e={rescheduleExam}
              busy={actionBusy}
              error={actionError}
              onCancel={() => setRescheduleExam(null)}
              onSubmit={(v) => void handleSaveReschedule(v)}
            />
          </div>
        </Modal>
      )}

      {/* ─── Slide-over Drawer for Exam Detail ───────────────────────────────── */}
      <ExamDetailDrawer
        isOpen={drawerExam !== null}
        onClose={() => setDrawerExam(null)}
        exam={drawerExam}
        canWork={true}
        subjects={[...subjects].map(([subjectId, subjectName]) => ({ subjectId, subjectName }))}
        onRefresh={load}
        onRescheduleClick={(ex) => {
          setDrawerExam(null);
          setRescheduleExam(ex);
        }}
      />
    </div>
  );
}
