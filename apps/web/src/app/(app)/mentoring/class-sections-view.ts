/**
 * The class page's checklists and timing, read from what the API sent. An item is done only when the API says what it names was
 * recorded; nothing here ticks itself, and a reminder that was only prepared is not shown as sent.
 */
import { activityLabel, hoursText, timeLabel } from './class-view';
import { SHARE_STATE, WorkspaceData } from './workspace-view';

export interface CheckRow { key: string; label: string; done: boolean; detail: string }

/** Before the class there is one required item: the tutor has sent the class reminder to the student. */
export function beforeChecklist(w: Pick<WorkspaceData, 'class'>): CheckRow[] {
  const r = w.class.checklist.find((c) => c.key === 'REMINDER');
  return [{ key: 'REMINDER', label: 'Tutor has sent the class reminder to the student', done: !!r?.done, detail: r?.detail ?? 'No reminder has been recorded' }];
}

/** After the class: the checklist message shared, the voice recording shared, and the activities given. */
export function afterChecklist(w: Pick<WorkspaceData, 'class' | 'after'>): CheckRow[] {
  const find = (k: string) => w.class.checklist.find((c) => c.key === k);
  const post = w.after.messages.find((m) => m.key === 'POST_CLASS_ACTIVITIES');
  const voice = find('VOICE');
  const acts = find('ACTIVITIES');
  return [
    { key: 'CHECKLIST_SHARED', label: 'After-class checklist shared', done: !!post?.share?.confirmedAt, detail: post ? SHARE_STATE(post.share) : 'Not prepared' },
    { key: 'VOICE', label: 'Voice recording shared', done: !!voice?.done, detail: voice?.detail ?? 'Not uploaded' },
    { key: 'ACTIVITIES', label: 'Activities given', done: !!acts?.done, detail: acts?.detail ?? 'None recorded' },
  ];
}

/** What the tutor submitted about the class, in plain rows. A field the tutor left empty is shown as empty, never filled in. */
export function tutorUpdateRows(w: Pick<WorkspaceData, 'class'>): Array<{ label: string; value: string }> {
  const u = w.class.update;
  if (!u || !u.submittedAt) return [];
  const some = (v: string | null | undefined) => (v && v.trim() ? v : 'Not written');
  return [
    { label: 'Class conducted', value: u.conducted === true ? 'Yes' : u.conducted === false ? 'No' : 'Not stated' },
    ...(u.conducted === false ? [{ label: 'Reason not conducted', value: some(u.notConductedReason) }] : [
      { label: 'Subject covered', value: some(u.subjectCovered) },
      { label: 'Topics covered', value: some(u.topicsCovered) },
      { label: 'Attendance', value: some(u.attendance) },
      { label: 'Participation', value: some(u.participation) },
      { label: 'Activities given', value: u.activities.length ? u.activities.map((a) => (a === 'OTHER' && u.otherActivity ? `Other: ${u.otherActivity}` : activityLabel(a))).join(', ') : 'None selected' },
      { label: 'Class evaluation remarks', value: some(u.evaluationRemarks) },
      { label: 'Additional remarks', value: some(u.classNotes) },
    ]),
  ];
}

export interface TimingRow { label: string; value: string; differs?: boolean }

/** Scheduled time and actual time side by side, never merged. The approved timetable is not changed by the actual time. */
export function timingRows(w: Pick<WorkspaceData, 'class'>): TimingRow[] {
  const c = w.class;
  const u = c.update;
  const hasActual = !!u && u.conducted !== false && u.actualStartMinute != null && u.actualEndMinute != null;
  const differs = hasActual && (u!.actualStartMinute !== c.startMinute || u!.actualEndMinute !== c.endMinute);
  return [
    { label: 'Scheduled', value: `${timeLabel(c)}, ${hoursText(c.scheduledMinutes)}` },
    { label: 'Actual start and end', value: hasActual ? timeLabel({ startMinute: u!.actualStartMinute as number, endMinute: u!.actualEndMinute as number }) : 'Not reported by the tutor yet', differs },
    { label: 'Actual duration', value: hasActual && u!.actualMinutes != null ? hoursText(u!.actualMinutes) : 'Not reported', differs },
  ];
}

/** Each submission of the tutor update that changed the actual times, so the change is on record. */
export function timingHistory(w: Pick<WorkspaceData, 'after'>): Array<{ version: number; at: string; by: string | null }> {
  return (w.after.versions ?? [])
    .filter((v) => v.changed.some((f) => f === 'actualStartMinute' || f === 'actualEndMinute' || f === 'actualMinutes'))
    .map((v) => ({ version: v.version, at: v.at, by: v.by }));
}

export const SECTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'before', label: 'Before class' },
  { key: 'after', label: 'After class' },
  { key: 'timing', label: 'Actual time' },
  { key: 'verification', label: 'Verification' },
];
