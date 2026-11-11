/**
 * The class workspace rules: post-class activities, the voice recording, the message templates and the strict conditions for
 * verifying a class. Pure rules, no database and no framework.
 *
 * Three things are kept apart on purpose, for the voice update and for every message: it was uploaded or written, it was shared
 * (a person says they pasted it into the existing WhatsApp group, and the record names them and the time), and the Mentor
 * verified it. Nothing here ever says a message was delivered: there is no WhatsApp integration, and delivery cannot be known.
 */

export const MIN_ACTIVITIES = 3;
export const TEXT_LIMIT = 2000;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

// ─── Post-class activities ───────────────────────────────────────────────────────────────────────────────────────
export const ACTIVITY_TYPES = ['EDUCATIONAL_GAME', 'WORKSHEET', 'PRACTICE_QUESTIONS', 'READING', 'WRITING', 'REVISION', 'QUIZ', 'PROBLEM_SOLVING', 'GROUP_DISCUSSION', 'PRACTICAL', 'HOMEWORK', 'PROJECT', 'OTHER'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  EDUCATIONAL_GAME: 'Educational game', WORKSHEET: 'Worksheet', PRACTICE_QUESTIONS: 'Practice questions', READING: 'Reading', WRITING: 'Writing', REVISION: 'Revision', QUIZ: 'Quiz', PROBLEM_SOLVING: 'Problem solving',
  GROUP_DISCUSSION: 'Group discussion', PRACTICAL: 'Practical activity', HOMEWORK: 'Homework', PROJECT: 'Project', OTHER: 'Other',
};
export const COMPLETIONS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_COMPLETED'] as const;
export type Completion = (typeof COMPLETIONS)[number];
export const COMPLETION_LABELS: Record<Completion, string> = { PENDING: 'Not started', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', NOT_COMPLETED: 'Not completed' };

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };
const text = (v: unknown): string | undefined => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : undefined);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export const LEARNING_LEVELS = ['BELOW_GRADE', 'ON_GRADE', 'ABOVE_GRADE'] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number];
export const LEARNING_LEVEL_LABELS: Record<LearningLevel, string> = { BELOW_GRADE: 'Below grade level', ON_GRADE: 'On grade level', ABOVE_GRADE: 'Above grade level' };
export const MAX_OPTIONS_PER_GROUP = 3;
const GROUP_KEY = /^[A-Za-z0-9 _-]{1,40}$/;

export interface CheckedActivity {
  title: string; type: ActivityType; topic: string | null; instructions: string; typeDescription: string | null; dueDate: string | null;
  gradeId: string | null; learningLevel: LearningLevel | null; suitabilityNote: string | null; optionGroupKey: string | null; optionLabel: string | null;
}
/**
 * One activity as the tutor writes it. A new activity needs its topic, the grade it suits and its learning level (strict). An activity made
 * before those fields existed can still be edited without them (not strict). Options of one activity share a group key and each has a label.
 * Other needs words.
 */
export function checkActivity(raw: unknown, opts: { strict?: boolean } = {}): Checked<CheckedActivity> {
  const strict = opts.strict !== false;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the activity.' };
  const r = raw as Record<string, unknown>;
  const f = { title: text(r.title), topic: text(r.topic), instructions: text(r.instructions), typeDescription: text(r.typeDescription) };
  if (Object.values(f).some((v) => v === undefined)) return { ok: false, message: 'The title, topic, instructions and description must be text.' };
  if (!f.title) return { ok: false, message: 'Give the activity a title.' };
  if (f.title.length > 200) return { ok: false, message: 'The title must be 200 characters or fewer.' };
  if (!(ACTIVITY_TYPES as readonly unknown[]).includes(r.type)) return { ok: false, message: 'Choose the type of activity.' };
  if (!f.instructions) return { ok: false, message: 'Write the instructions for the student.' };
  if ((f.instructions).length > TEXT_LIMIT || (f.topic ?? '').length > 200 || (f.typeDescription ?? '').length > 200) return { ok: false, message: 'One of the texts is too long.' };
  if (r.type === 'OTHER' && !f.typeDescription) return { ok: false, message: 'Describe the other kind of activity.' };
  if (strict && !f.topic) return { ok: false, message: 'Say which topic the activity is about.' };
  const grade = text(r.gradeId);
  const level = text(r.learningLevel);
  const note = text(r.suitabilityNote);
  const groupKey = text(r.optionGroupKey);
  const label = text(r.optionLabel);
  if ([grade, level, note, groupKey, label].some((v) => v === undefined)) return { ok: false, message: 'The grade, level, note and option fields must be text.' };
  if (strict && !grade) return { ok: false, message: 'Choose the grade the activity suits.' };
  if (level && !(LEARNING_LEVELS as readonly string[]).includes(level)) return { ok: false, message: 'Choose below grade, on grade or above grade level.' };
  if (strict && !level) return { ok: false, message: 'Choose the learning level of the activity.' };
  if ((note ?? '').length > 1000) return { ok: false, message: 'The suitability note must be 1000 characters or fewer.' };
  if ((groupKey || label) && !(groupKey && label)) return { ok: false, message: 'An option needs both a group name and its own label.' };
  if (groupKey && !GROUP_KEY.test(groupKey)) return { ok: false, message: 'The option group name may use letters, numbers, spaces, dashes and underscores, up to 40 characters.' };
  if ((label ?? '').length > 100) return { ok: false, message: 'The option label must be 100 characters or fewer.' };
  const due = r.dueDate === undefined || r.dueDate === null || r.dueDate === '' ? null : r.dueDate;
  if (due !== null && !isDate(due)) return { ok: false, message: 'Choose a real due date, written like 2026-11-12.' };
  return {
    ok: true,
    value: {
      title: f.title, type: r.type as ActivityType, topic: f.topic || null, instructions: f.instructions, typeDescription: r.type === 'OTHER' ? f.typeDescription || null : null, dueDate: due,
      gradeId: grade || null, learningLevel: (level || null) as LearningLevel | null, suitabilityNote: note || null, optionGroupKey: groupKey || null, optionLabel: label || null,
    },
  };
}

/**
 * How many of the three activities are made and shared. The options of one group count once: a group is created when it has any option,
 * and shared only when every one of its options has been shared. An activity with no group counts as a group of its own.
 */
export function countActivities(rows: ReadonlyArray<{ id: string; optionGroupKey?: string | null; sharedAt?: unknown }>): { created: number; shared: number } {
  const groups = new Map<string, boolean>();
  for (const r of rows) {
    const key = r.optionGroupKey ? `group:${r.optionGroupKey}` : `one:${r.id}`;
    groups.set(key, (groups.get(key) ?? true) && !!r.sharedAt);
  }
  return { created: groups.size, shared: [...groups.values()].filter(Boolean).length };
}

export interface CheckedResponse { response: string | null; completion: Completion; tutorRemarks: string | null; mentorRemarks: string | null; hasTutorRemarks: boolean; hasMentorRemarks: boolean }
/** What the student did with an activity, written down by the tutor or the Mentor (students have no login). Never blocks verification. */
export function checkResponse(raw: unknown): Checked<CheckedResponse> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the response.' };
  const r = raw as Record<string, unknown>;
  const f = { response: text(r.response), tutorRemarks: text(r.tutorRemarks), mentorRemarks: text(r.mentorRemarks) };
  if (Object.values(f).some((v) => v === undefined)) return { ok: false, message: 'The response and remarks must be text.' };
  if (Object.values(f).some((v) => (v as string).length > TEXT_LIMIT)) return { ok: false, message: `Each text must be ${TEXT_LIMIT} characters or fewer.` };
  if (!(COMPLETIONS as readonly unknown[]).includes(r.completion)) return { ok: false, message: 'Say whether the student has completed it, is working on it, or has not done it.' };
  return { ok: true, value: { response: f.response || null, completion: r.completion as Completion, tutorRemarks: f.tutorRemarks || null, mentorRemarks: f.mentorRemarks || null, hasTutorRemarks: r.tutorRemarks !== undefined, hasMentorRemarks: r.mentorRemarks !== undefined } };
}

// ─── The voice recording ─────────────────────────────────────────────────────────────────────────────────────────
type Family = { mime: string; extension: string; claims: readonly string[] };
const FAMILIES: readonly Family[] = [
  { mime: 'audio/mpeg', extension: '.mp3', claims: ['audio/mpeg', 'audio/mp3'] },
  { mime: 'audio/mp4', extension: '.m4a', claims: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/3gpp'] },
  { mime: 'audio/ogg', extension: '.ogg', claims: ['audio/ogg', 'application/ogg', 'audio/opus'] },
  { mime: 'audio/webm', extension: '.webm', claims: ['audio/webm'] },
  { mime: 'audio/wav', extension: '.wav', claims: ['audio/wav', 'audio/x-wav', 'audio/wave'] },
  { mime: 'audio/aac', extension: '.aac', claims: ['audio/aac', 'audio/x-aac'] },
  { mime: 'audio/amr', extension: '.amr', claims: ['audio/amr'] },
];
export const ALLOWED_AUDIO_MIME = FAMILIES.map((f) => f.mime);

/** What the first bytes say the file is. The claimed type is never trusted on its own. */
export function sniffAudio(b: Buffer): Family | null {
  if (b.length < 12) return null;
  const at = (i: number, s: string) => b.subarray(i, i + s.length).toString('latin1') === s;
  if (at(0, 'ID3')) return FAMILIES[0];
  if (b[0] === 0xff && (b[1] & 0xf0) === 0xf0 && (b[1] & 0x06) === 0) return FAMILIES[5]; // ADTS AAC
  if (isMpegAudioFrame(b)) return FAMILIES[0];
  if (at(4, 'ftyp')) return FAMILIES[1];
  if (at(0, 'OggS')) return FAMILIES[2];
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return FAMILIES[3];
  if (at(0, 'RIFF') && at(8, 'WAVE')) return FAMILIES[4];
  if (at(0, '#!AMR')) return FAMILIES[6];
  return null;
}

/** A real MPEG audio frame header: not the reserved version, layer, bitrate or sample rate values. Random bytes that start with 0xFF do not pass. */
function isMpegAudioFrame(b: Buffer): boolean {
  if (b[0] !== 0xff || (b[1] & 0xe0) !== 0xe0) return false;
  return (b[1] & 0x18) !== 0x08 && (b[1] & 0x06) !== 0x00 && (b[2] & 0xf0) !== 0xf0 && (b[2] & 0x0c) !== 0x0c;
}

/**
 * Video is not accepted as a voice recording, even when the container is one that audio uses too (MP4, WebM, Ogg). The container is
 * searched for a video track: an MP4 handler of type vide, a Matroska video codec id, or a Theora stream.
 */
export function hasVideoTrack(b: Buffer): boolean {
  const mp4 = b.subarray(4, 8).toString('latin1') === 'ftyp';
  if (mp4) {
    let i = b.indexOf('hdlr', 0, 'latin1');
    while (i !== -1) {
      if (b.subarray(i + 12, i + 16).toString('latin1') === 'vide') return true;
      i = b.indexOf('hdlr', i + 4, 'latin1');
    }
    return false;
  }
  const head = b.subarray(0, 65536).toString('latin1');
  if (b[0] === 0x1a && b[1] === 0x45) return /V_(VP8|VP9|AV1|MPEG4|MPEGH|THEORA|UNCOMPRESSED|MS)/.test(head);
  if (b.subarray(0, 4).toString('latin1') === 'OggS') return /theora/.test(head);
  return false;
}

export type AudioCheck = { ok: true; mime: string; extension: string } | { ok: false; code: string; message: string };
/** An upload is accepted only if it has bytes, is not too big, looks like audio, and is the kind of audio it says it is. */
export function checkAudio(b: Buffer | null | undefined, claimedMime: string): AudioCheck {
  if (!b || b.length === 0) return { ok: false, code: 'EMPTY_FILE', message: 'The recording is empty.' };
  if (b.length > MAX_AUDIO_BYTES) return { ok: false, code: 'FILE_TOO_LARGE', message: `The recording is larger than ${MAX_AUDIO_BYTES / 1024 / 1024} MB. Record a shorter voice update.` };
  const claimedType = claimedMime.toLowerCase().split(';')[0].trim();
  if (claimedType.startsWith('video/')) return { ok: false, code: 'VIDEO_NOT_ALLOWED', message: 'Video files cannot be used as a voice recording. Upload an audio file.' };
  const found = sniffAudio(b);
  if (!found) return { ok: false, code: 'NOT_AUDIO', message: 'This file is not a supported voice recording. Use MP3, M4A, OGG, WebM, WAV, AAC or AMR.' };
  if (hasVideoTrack(b)) return { ok: false, code: 'VIDEO_NOT_ALLOWED', message: 'This file contains video. Upload an audio only recording.' };
  const claimed = claimedType;
  if (!found.claims.includes(claimed)) return { ok: false, code: 'FORGED_MIME_TYPE', message: `The file says it is ${claimed || 'unknown'} but its content is ${found.mime}.` };
  return { ok: true, mime: found.mime, extension: found.extension };
}

/** A safe name to show, never used to store the file. */
export function safeFileName(name: string): string {
  const base = (name || 'voice-update').replace(/\\/g, '/').split('/').pop() as string;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'voice-update';
}

// ─── Message templates ───────────────────────────────────────────────────────────────────────────────────────────
export interface TemplateDef { key: string; name: string; body: string; placeholders: readonly string[] }
export const PLACEHOLDERS = ['studentName', 'tutorName', 'classDate', 'classTime', 'subject', 'duration', 'topicsCovered', 'practiceWork', 'meetLink', 'activityList', 'mentorName'] as const;

/** The built-in templates. A saved template of the same key replaces one. The class update format is the approved one. */
export const DEFAULT_TEMPLATES: readonly TemplateDef[] = [
  {
    key: 'CLASS_REMINDER', name: 'Class reminder', placeholders: ['studentName', 'tutorName', 'subject', 'classDate', 'classTime', 'meetLink'],
    body: '⏰ Class reminder\nStudent: {{studentName}}\nTutor: {{tutorName}}\nSubject: {{subject}}\nDate: {{classDate}}\nTime: {{classTime}}\nMeet link: {{meetLink}}',
  },
  {
    key: 'CLASS_UPDATE', name: 'Class update', placeholders: ['studentName', 'tutorName', 'classDate', 'subject', 'duration', 'topicsCovered', 'practiceWork'],
    body: "📚 𝐂𝐋𝐀𝐒𝐒 𝐔𝐏𝐃𝐀𝐓𝐄\n🧑‍🎓 𝐒𝐭𝐮𝐝𝐞𝐧𝐭 𝐍𝐚𝐦𝐞: {{studentName}}\n🧑‍🏫 𝐓𝐮𝐭𝐨𝐫 𝐍𝐚𝐦𝐞: {{tutorName}}\n📅 𝐃𝐚𝐭𝐞: {{classDate}}\n📚 𝐒𝐮𝐛𝐣𝐞𝐜𝐭: {{subject}}\n⏰ 𝐃𝐮𝐫𝐚𝐭𝐢𝐨𝐧: {{duration}}\n📖 𝐓𝐨𝐩𝐢𝐜 𝐂𝐨𝐯𝐞𝐫𝐞𝐝: {{topicsCovered}}\n📝 𝐏𝐫𝐚𝐜𝐭𝐢𝐜𝐞 𝐖𝐨𝐫𝐤: {{practiceWork}}",
  },
  {
    key: 'POST_CLASS_ACTIVITIES', name: 'Post-class activities', placeholders: ['studentName', 'subject', 'classDate', 'activityList'],
    body: 'Activities after class\nStudent: {{studentName}}\nSubject: {{subject}}\nClass date: {{classDate}}\n\n{{activityList}}',
  },
];
export const TEMPLATE_KEYS = DEFAULT_TEMPLATES.map((t) => t.key);

/** The placeholders a body uses, in order, each once. */
export const placeholdersIn = (body: string): string[] => [...new Set([...body.matchAll(/\{\{\s*([A-Za-z]+)\s*\}\}/g)].map((m) => m[1]))];

/** A template a person edits: its text may use only the placeholders the system knows, and must use at least one. */
export function checkTemplate(raw: unknown): Checked<{ name: string; body: string }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the template.' };
  const r = raw as Record<string, unknown>;
  const name = text(r.name);
  const body = typeof r.body === 'string' ? r.body.trim() : undefined;
  if (!name) return { ok: false, message: 'Give the template a name.' };
  if (!body) return { ok: false, message: 'Write the message.' };
  if (name.length > 100 || body.length > 3000) return { ok: false, message: 'The name or the message is too long.' };
  const unknown = placeholdersIn(body).filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p));
  if (unknown.length) return { ok: false, message: `These fields are not known: ${unknown.join(', ')}. Use only ${PLACEHOLDERS.join(', ')}.` };
  if (placeholdersIn(body).length === 0) return { ok: false, message: 'Use at least one field, such as {{studentName}}, so the message is filled in from the class.' };
  return { ok: true, value: { name, body } };
}

export type Rendered = { ok: true; text: string; used: string[] } | { ok: false; missing: string[]; message: string };
const FIELD_NAMES: Record<string, string> = { studentName: 'the student name', tutorName: 'the tutor name', classDate: 'the class date', classTime: 'the class time', subject: 'the subject', duration: 'the duration', topicsCovered: 'the topics covered', practiceWork: 'the practice work', meetLink: 'the Meet link', activityList: 'the activities', mentorName: 'the Mentor name' };
/** Fills a template from the class. A field with no value is never made up: the message is refused and says what to complete. */
export function renderTemplate(body: string, values: Record<string, string | null | undefined>): Rendered {
  const used = placeholdersIn(body);
  const missing = used.filter((p) => !(values[p] ?? '').toString().trim());
  if (missing.length) return { ok: false, missing, message: `Complete ${missing.map((m) => FIELD_NAMES[m] ?? m).join(', ')} first.` };
  return { ok: true, used, text: body.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (_, p: string) => String(values[p]).trim()) };
}

// ─── Verification ────────────────────────────────────────────────────────────────────────────────────────────────
export interface VerifyFacts {
  conducted: boolean | null;
  tutorSubmitted: boolean;
  voiceUploaded: boolean;
  voiceShared: boolean;
  activitiesCreated: number;
  activitiesShared: number;
  exceptionApproved: boolean;
}

/**
 * What stands between a conducted class and its verification. Empty means the Mentor may verify. An approved exception lifts the
 * voice and activity conditions only; the class must still have been conducted and the tutor update submitted. Student responses
 * and completion are not conditions at all: they stay trackable after the class is consumed.
 */
export function verificationBlockers(f: VerifyFacts): string[] {
  const out: string[] = [];
  if (f.conducted !== true) out.push('The class has not been recorded as conducted.');
  if (!f.tutorSubmitted) out.push('The tutor class update has not been submitted.');
  if (f.exceptionApproved) return out;
  if (!f.voiceUploaded) out.push('The tutor voice recording has not been uploaded.');
  else if (!f.voiceShared) out.push('Sharing the voice recording in the group has not been confirmed.');
  if (f.activitiesCreated < MIN_ACTIVITIES) out.push(`At least ${MIN_ACTIVITIES} post-class activities are needed. ${f.activitiesCreated} created.`);
  else if (f.activitiesShared < MIN_ACTIVITIES) out.push(`Sharing at least ${MIN_ACTIVITIES} activities in the group has not been confirmed. ${f.activitiesShared} confirmed.`);
  return out;
}

export interface CheckedReason { reason: string }
export function checkReason(raw: unknown, what: string): Checked<string> {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? text((raw as Record<string, unknown>).reason) : typeof raw === 'string' ? raw.trim() : undefined;
  if (v === undefined) return { ok: false, message: `The reason must be text.` };
  if (!v) return { ok: false, message: `Say why ${what}.` };
  if (v.length > 1000) return { ok: false, message: 'The reason must be 1000 characters or fewer.' };
  return { ok: true, value: v };
}

/** A Meet link: empty clears it; otherwise it must be a plain https address. */
export function checkMeetLink(raw: unknown): Checked<string | null> {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? text((raw as Record<string, unknown>).link) : undefined;
  if (v === undefined) return { ok: false, message: 'The link must be text.' };
  if (!v) return { ok: true, value: null };
  if (v.length > 300) return { ok: false, message: 'The link must be 300 characters or fewer.' };
  let u: URL;
  try { u = new URL(v); } catch { return { ok: false, message: 'Write the link as a full address, like https://meet.google.com/abc-defg-hij.' }; }
  if (u.protocol !== 'https:') return { ok: false, message: 'The link must start with https://.' };
  return { ok: true, value: u.toString() };
}

// ─── Playback ranges ─────────────────────────────────────────────────────────────────────────────────────────────
export type ByteRange = { kind: 'none' } | { kind: 'ok'; start: number; end: number } | { kind: 'unsatisfiable' };
/**
 * One byte range of a file of a known size, from a Range request header. No header, an unknown unit, several ranges or text that
 * is not a range all mean "send the whole file". A start beyond the end of the file is unsatisfiable (416). An end beyond the file
 * is cut to the last byte, and a suffix range (bytes=-500) means the last 500 bytes.
 */
export function parseRange(header: string | undefined | null, size: number): ByteRange {
  if (!header) return { kind: 'none' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return { kind: 'none' };
  if (size <= 0) return { kind: 'unsatisfiable' };
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return { kind: 'unsatisfiable' };
    return { kind: 'ok', start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (!Number.isSafeInteger(start) || start >= size) return { kind: 'unsatisfiable' };
  if (end < start) return { kind: 'none' };
  return { kind: 'ok', start, end };
}

// ─── Which daily class cards a class belongs to ──────────────────────────────────────────────────────────────────
export const CLASS_CARD_KEYS = ['classes_today', 'classes_upcoming', 'classes_awaiting_update', 'classes_awaiting_verification', 'classes_verified', 'classes_not_conducted', 'classes_rescheduled', 'classes_voice_pending', 'classes_conducted', 'classes_awaiting_activities', 'classes_cancelled'] as const;
export type ClassCardKey = (typeof CLASS_CARD_KEYS)[number];
export interface CardClass {
  date: string; status: string; state: string; moved: boolean;
  update: { conducted: boolean | null } | null;
  voice: { uploaded: boolean; shared: boolean };
  activityCounts: { created: number; shared: number };
  exception: { status: string | null };
}
/** The one definition of every daily class card, so the dashboard count and the list the card opens can never disagree. */
export function classCardsOf(k: CardClass, today: string): ClassCardKey[] {
  const out: ClassCardKey[] = [];
  if (k.date === today && k.status !== 'CANCELLED') out.push('classes_today');
  if (k.date > today && ['SCHEDULED', 'RESCHEDULED'].includes(k.status)) out.push('classes_upcoming');
  if (k.state === 'AWAITING_TUTOR_UPDATE') out.push('classes_awaiting_update');
  if (k.state === 'AWAITING_MENTOR_VERIFICATION') out.push('classes_awaiting_verification');
  if (k.state === 'VERIFIED') out.push('classes_verified');
  if (k.state === 'NOT_CONDUCTED') out.push('classes_not_conducted');
  if (k.moved) out.push('classes_rescheduled');
  const closed = k.state === 'VERIFIED' || k.state === 'NOT_CONDUCTED' || k.state === 'CANCELLED';
  const waived = k.exception.status === 'APPROVED';
  if (k.update?.conducted) out.push('classes_conducted');
  if (k.update?.conducted && !closed && !waived && !(k.voice.uploaded && k.voice.shared)) out.push('classes_voice_pending');
  if (k.update?.conducted && !closed && !waived && !(k.activityCounts.created >= MIN_ACTIVITIES && k.activityCounts.shared >= MIN_ACTIVITIES)) out.push('classes_awaiting_activities');
  if (k.state === 'CANCELLED') out.push('classes_cancelled');
  return out;
}

// ─── Two independent statuses: was the class conducted, and is its documentation complete ──────────────────────────
export type ClassConduct = 'SCHEDULED' | 'RESCHEDULED' | 'PENDING_REPORT' | 'CONDUCTED' | 'NOT_CONDUCTED' | 'CANCELLED';
export const CLASS_CONDUCT_LABELS: Record<ClassConduct, string> = {
  SCHEDULED: 'Scheduled', RESCHEDULED: 'Rescheduled', PENDING_REPORT: 'Report pending', CONDUCTED: 'Conducted', NOT_CONDUCTED: 'Not conducted', CANCELLED: 'Cancelled',
};
/**
 * Whether the class took place. Read only from what is recorded: the tutor's report and the Mentor's confirmation. Completing the
 * paperwork never makes a class conducted, and a conducted class is not thereby documented.
 */
export function classConduct(f: { status: string; conducted: boolean | null; state: string }): ClassConduct {
  if (f.status === 'CANCELLED') return 'CANCELLED';
  if (f.conducted === true) return 'CONDUCTED';
  if (f.conducted === false || f.status === 'NOT_CONDUCTED') return 'NOT_CONDUCTED';
  if (f.state === 'AWAITING_TUTOR_UPDATE') return 'PENDING_REPORT';
  return f.status === 'RESCHEDULED' ? 'RESCHEDULED' : 'SCHEDULED';
}

export type DocumentationStatus = 'NOT_REQUIRED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'RETURNED' | 'COMPLETE';
export const DOCUMENTATION_LABELS: Record<DocumentationStatus, string> = {
  NOT_REQUIRED: 'Not required', NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', RETURNED: 'Returned for correction', COMPLETE: 'Complete',
};
export interface DocumentationFacts {
  status: string; conducted: boolean | null; tutorSubmitted: boolean; voiceUploaded: boolean; voiceShared: boolean;
  activitiesCreated: number; activitiesShared: number; exceptionApproved: boolean;
}
/**
 * Whether the paperwork is complete: the tutor update submitted, the voice recording uploaded and its sharing confirmed, and three
 * activities created and their sharing confirmed, unless the Mentoring Head approved an exception (which lifts only the voice and
 * activity items, never the tutor update). It does not depend on whether the class was conducted, except that a class that was not
 * conducted or was cancelled needs no documentation. It is not the same as verification, which stays the Mentor's action.
 */
export function documentationStatus(f: DocumentationFacts): { status: DocumentationStatus; missing: string[] } {
  if (f.status === 'CANCELLED' || f.conducted === false || f.status === 'NOT_CONDUCTED') return { status: 'NOT_REQUIRED', missing: [] };
  const missing = verificationBlockers({ conducted: true, tutorSubmitted: f.tutorSubmitted, voiceUploaded: f.voiceUploaded, voiceShared: f.voiceShared, activitiesCreated: f.activitiesCreated, activitiesShared: f.activitiesShared, exceptionApproved: f.exceptionApproved });
  if (f.status === 'RETURNED_FOR_CORRECTION') return { status: 'RETURNED', missing };
  if (f.tutorSubmitted && missing.length === 0) return { status: 'COMPLETE', missing };
  const started = f.tutorSubmitted || f.voiceUploaded || f.activitiesCreated > 0;
  return { status: started ? 'IN_PROGRESS' : 'NOT_STARTED', missing };
}

// ─── Follow-up tasks of a class ──────────────────────────────────────────────────────────────────────────────────
export const FOLLOW_UP_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type FollowUpPriority = (typeof FOLLOW_UP_PRIORITIES)[number];
export interface CheckedFollowUp { title: string; description: string | null; priority: FollowUpPriority; dueDate: string; assignee: 'TUTOR' | 'MENTOR' }

/** A follow-up task about a class: a title, who does it, and a due date that is not in the past. */
export function checkFollowUp(raw: unknown, today: string): Checked<CheckedFollowUp> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the follow-up.' };
  const r = raw as Record<string, unknown>;
  const title = text(r.title);
  const description = text(r.description);
  if (title === undefined || description === undefined) return { ok: false, message: 'The title and description must be text.' };
  if (!title) return { ok: false, message: 'Give the follow-up a title.' };
  if (title.length > 200) return { ok: false, message: 'The title must be 200 characters or fewer.' };
  if (description.length > TEXT_LIMIT) return { ok: false, message: `The description must be ${TEXT_LIMIT} characters or fewer.` };
  const priority = r.priority === undefined || r.priority === null || r.priority === '' ? 'MEDIUM' : r.priority;
  if (!(FOLLOW_UP_PRIORITIES as readonly unknown[]).includes(priority)) return { ok: false, message: 'Choose low, medium, high or urgent priority.' };
  const assignee = r.assignee === undefined || r.assignee === null || r.assignee === '' ? 'TUTOR' : r.assignee;
  if (assignee !== 'TUTOR' && assignee !== 'MENTOR') return { ok: false, message: 'Give the follow-up to the tutor or keep it yourself.' };
  if (!isDate(r.dueDate)) return { ok: false, message: 'Choose a due date, written like 2026-11-12.' };
  if (r.dueDate < today) return { ok: false, message: 'The due date cannot be in the past.' };
  return { ok: true, value: { title, description: description || null, priority: priority as FollowUpPriority, dueDate: r.dueDate, assignee } };
}

/** The tutor starts a follow-up, or hands it in. Handing in needs a note, so the Mentor knows what was done. */
export function checkFollowUpProgress(raw: unknown): Checked<{ status: 'IN_PROGRESS' | 'SUBMITTED'; note: string | null }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the progress.' };
  const r = raw as Record<string, unknown>;
  if (r.status !== 'IN_PROGRESS' && r.status !== 'SUBMITTED') return { ok: false, message: 'Say whether you have started it or handed it in.' };
  const note = text(r.note);
  if (note === undefined) return { ok: false, message: 'The note must be text.' };
  if (note.length > 1000) return { ok: false, message: 'The note must be 1000 characters or fewer.' };
  if (r.status === 'SUBMITTED' && !note) return { ok: false, message: 'Write what was done, so the Mentor can check it.' };
  return { ok: true, value: { status: r.status, note: note || null } };
}

/** The Mentor verifies, sends back or cancels. Sending back and cancelling need a reason. */
export function checkFollowUpDecision(raw: unknown): Checked<{ decision: 'VERIFIED' | 'RETURNED' | 'CANCELLED'; reason: string | null }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the decision.' };
  const r = raw as Record<string, unknown>;
  if (r.decision !== 'VERIFIED' && r.decision !== 'RETURNED' && r.decision !== 'CANCELLED') return { ok: false, message: 'Choose verify, send back or cancel.' };
  const reason = text(r.reason);
  if (reason === undefined) return { ok: false, message: 'The reason must be text.' };
  if (reason.length > 1000) return { ok: false, message: 'The reason must be 1000 characters or fewer.' };
  if (r.decision !== 'VERIFIED' && !reason) return { ok: false, message: r.decision === 'RETURNED' ? 'Say what needs to be done again.' : 'Say why it is cancelled.' };
  return { ok: true, value: { decision: r.decision, reason: reason || null } };
}
