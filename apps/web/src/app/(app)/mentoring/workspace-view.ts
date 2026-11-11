/**
 * What the class workspace screens show and how their forms become requests. The API decides every rule (who may do what, when a
 * class can be verified, what a message says). This file only arranges what it sent and checks the obvious before asking.
 * Delivery is never claimed: a message is copied, and a named person then says they shared it.
 */
import type { ClassItem } from './class-view';

export type WorkspaceRole = 'MENTOR' | 'TUTOR';

export interface ShareInfo { id: string; text: string; preparedBy: string | null; preparedAt: string; copiedAt: string | null; confirmedAt: string | null; confirmedBy: string | null }
export interface MessagePreview { key: string; name: string; ok: boolean; text: string | null; missing: string[]; message: string | null; placeholders: string[]; share: ShareInfo | null }
export interface VoiceInfo { id: string; fileName: string; size: number; mimeType: string; uploadedAt: string; uploadedBy: string | null; sharedAt: string | null; sharedBy: string | null; mentorVerifiedAt: string | null; mentorVerifiedBy: string | null }
export interface ActivityInfo {
  id: string; position: number; title: string; type: string; typeLabel: string; typeDescription: string | null; topic: string; instructions: string; dueDate: string | null;
  sharedAt: string | null; sharedBy: string | null; studentResponse: string | null; respondedAt: string | null; completion: string; completionLabel: string; tutorRemarks: string | null; mentorRemarks: string | null;
}
/** The API sends null when no exception has been asked for. */
export interface ExceptionInfo { status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | null; reason: string | null; requestedBy: string | null; requestedAt: string | null; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null }

export interface WorkspaceData {
  class: ClassItem & { meetLink?: string | null; cancelled?: { reason: string } | null; consumption: 'CONSUMED' | 'NOT_CONSUMED' };
  student: { name: string; studentId: string | null };
  tutorName: string;
  mentorName: string | null;
  before: { targetAt: string; leadMinutes: number; meetLink: string | null; warning: { level: 'amber' | 'red'; text: string } | null; done: boolean; message: MessagePreview };
  after: { voice: VoiceInfo | null; earlierVoice: number; activities: ActivityInfo[]; minimumActivities: number; messages: MessagePreview[]; canEdit: boolean };
  review: {
    blockers: string[]; canVerify: boolean; mentorRemarks: string | null; exception: ExceptionInfo;
    cancelled: { at: string; by: string | null; reason: string | null } | null; consumption: 'CONSUMED' | 'NOT_CONSUMED';
    minutes: { scheduled: number; reported: number | null; verified: number | null; consumed: number };
  };
  canWork?: boolean;
  canDecideException?: boolean;
}

export interface ListRow extends ClassItem { studentId: string | null; mentorUserId: string | null; mentorName: string | null; consumption: 'CONSUMED' | 'NOT_CONSUMED'; cancelled?: { reason: string } | null }
export interface ListData { date: string; from?: string; to?: string; card?: string | null; counts: Record<string, number>; total: number; page: number; pageSize: number; pages: number; rows: ListRow[] }

export interface ListFilters { date: string; from: string; to: string; card: string; mentorUserId: string; studentQuery: string; tutorProfileId: string; subjectId: string; state: string }
export const emptyListFilters = (date: string): ListFilters => ({ date, from: '', to: '', card: '', mentorUserId: '', studentQuery: '', tutorProfileId: '', subjectId: '', state: '' });
export function listQuery(f: ListFilters, page = 1): string {
  // A range (from the dashboard) replaces the single day, so the two are never sent together.
  const { date, ...rest } = f;
  const base = f.from || f.to ? rest : { date, ...rest };
  const parts = Object.entries({ ...base, page: String(page) }).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return `?${parts.join('&')}`;
}

/** The base of the workspace routes for a role. The tutor routes never name a tutor. */
export const workspaceBase = (role: WorkspaceRole) => (role === 'TUTOR' ? '/tutor-portal/class-workspace' : '/mentoring/class-workspace');
/** Where a recording plays: a signed-in route in this app that passes the user's own session on to the API. */
export const audioUrl = (role: WorkspaceRole, attachmentId: string) => `/api/class-audio/${role === 'TUTOR' ? 'tutor' : 'mentoring'}/${encodeURIComponent(attachmentId)}`;
export const voiceUploadUrl = (key: string) => `/api/class-voice/${encodeURIComponent(key)}`;

export const SHARE_STATE = (s: ShareInfo | null): string => (!s ? 'Not prepared' : s.confirmedAt ? 'Shared, confirmed' : s.copiedAt ? 'Copied, not yet confirmed as shared' : 'Prepared, not copied');

export const fileSizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
export const AUDIO_ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/wav,audio/aac,audio/amr,.mp3,.m4a,.ogg,.webm,.wav,.aac,.amr';
export const MAX_AUDIO_MB = 15;

/** Problems a file has before it is sent. The server checks the real content again, so this only saves a round trip. */
export function audioProblem(file: { name: string; size: number } | null): string | null {
  if (!file) return 'Choose a recording first.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_AUDIO_MB * 1024 * 1024) return `The recording is larger than ${MAX_AUDIO_MB} MB.`;
  return null;
}

export interface ActivityDraft { title: string; type: string; typeDescription: string; topic: string; instructions: string; dueDate: string }
export const emptyActivity = (): ActivityDraft => ({ title: '', type: 'WORKSHEET', typeDescription: '', topic: '', instructions: '', dueDate: '' });
export const draftOfActivity = (a: ActivityInfo): ActivityDraft => ({ title: a.title, type: a.type, typeDescription: a.typeDescription ?? '', topic: a.topic, instructions: a.instructions, dueDate: a.dueDate ?? '' });
export function activityProblems(d: ActivityDraft): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push('a title');
  if (!d.topic.trim()) out.push('the topic');
  if (!d.instructions.trim()) out.push('the instructions');
  if (d.type === 'OTHER' && !d.typeDescription.trim()) out.push('a description of the other kind');
  return out;
}
export const payloadOfActivity = (d: ActivityDraft) => ({
  title: d.title, type: d.type, topic: d.topic, instructions: d.instructions,
  ...(d.type === 'OTHER' ? { typeDescription: d.typeDescription } : {}), ...(d.dueDate ? { dueDate: d.dueDate } : {}),
});

/**
 * The kinds of post-class activity the API accepts, with the words people see. These are the codes the API and the database check, which
 * are not the same as the tutor update's tick boxes in class-view.
 */
export const ACTIVITY_CHOICES: Array<[string, string]> = [
  ['EDUCATIONAL_GAME', 'Educational game'], ['WORKSHEET', 'Worksheet'], ['PRACTICE_QUESTIONS', 'Practice questions'], ['READING', 'Reading'], ['WRITING', 'Writing'], ['REVISION', 'Revision'],
  ['QUIZ', 'Quiz'], ['PROBLEM_SOLVING', 'Problem solving'], ['GROUP_DISCUSSION', 'Group discussion'], ['PRACTICAL', 'Practical activity'], ['HOMEWORK', 'Homework'], ['PROJECT', 'Project'], ['OTHER', 'Other'],
];
/** No exception has been asked for, or what has been decided. The API's null means none. */
export const exceptionKind = (x: Pick<ExceptionInfo, 'status'> | null | undefined): 'NONE' | 'REQUESTED' | 'APPROVED' | 'REJECTED' => x?.status ?? 'NONE';

export const COMPLETION_CHOICES: Array<[string, string]> = [['PENDING', 'Not yet done'], ['IN_PROGRESS', 'Working on it'], ['COMPLETED', 'Completed'], ['NOT_COMPLETED', 'Not completed']];

/** Plain words for what stops a class being verified, counted as the API counted them. */
export const verifyHint = (r: WorkspaceData['review']) => (r.blockers.length ? r.blockers.join(' ') : 'Everything needed to verify this class is in place.');

/** Copies text to the clipboard. Returns false when the browser does not allow it, so the person can select the text instead. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
