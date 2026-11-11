import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, CLASS_CARD_KEYS, CardClass, DEFAULT_TEMPLATES, MAX_AUDIO_BYTES, MIN_ACTIVITIES, VerifyFacts, checkActivity, checkAudio, checkMeetLink, checkReason, checkResponse, checkTemplate, classCardsOf, hasVideoTrack, parseRange, placeholdersIn, renderTemplate, safeFileName, sniffAudio,
  verificationBlockers,
} from './class-workspace';

const pad = (head: number[] | string, total = 64) => {
  const b = Buffer.alloc(total);
  if (typeof head === 'string') b.write(head, 0, 'latin1'); else Buffer.from(head).copy(b);
  return b;
};
const MP3 = pad('ID3\u0003\u0000');
const M4A = (() => { const b = Buffer.alloc(64); b.write('ftypM4A ', 4, 'latin1'); return b; })();
const OGG = pad('OggS');
const WEBM = pad([0x1a, 0x45, 0xdf, 0xa3]);
const WAV = (() => { const b = Buffer.alloc(64); b.write('RIFF', 0); b.write('WAVE', 8); return b; })();
const AMR = pad('#!AMR\n');
const PDF = pad('%PDF-1.4');

describe('post-class activities', () => {
  const good = { title: 'Tenses worksheet', type: 'WORKSHEET', topic: 'Past tense', instructions: 'Complete the first two pages.', dueDate: '2026-11-12' };

  it('needs a title, a type, instructions and a real due date when one is given', () => {
    expect(checkActivity(good)).toEqual({ ok: true, value: { title: 'Tenses worksheet', type: 'WORKSHEET', topic: 'Past tense', instructions: 'Complete the first two pages.', typeDescription: null, dueDate: '2026-11-12' } });
    expect(checkActivity({ ...good, title: ' ' })).toMatchObject({ ok: false, message: 'Give the activity a title.' });
    expect(checkActivity({ ...good, type: 'DANCE' })).toMatchObject({ ok: false, message: 'Choose the type of activity.' });
    expect(checkActivity({ ...good, instructions: '' })).toMatchObject({ ok: false, message: 'Write the instructions for the student.' });
    expect(checkActivity({ ...good, dueDate: '2026-02-30' })).toMatchObject({ ok: false, message: expect.stringContaining('real due date') });
    expect(checkActivity({ ...good, dueDate: undefined })).toMatchObject({ ok: true, value: { dueDate: null } });
    expect(checkActivity(null)).toMatchObject({ ok: false });
  });

  it('has the thirteen kinds of activity of the brief, and Other needs a description', () => {
    expect(ACTIVITY_TYPES).toHaveLength(13);
    expect(Object.values(ACTIVITY_TYPE_LABELS)).toEqual(expect.arrayContaining(['Educational game', 'Worksheet', 'Practice questions', 'Reading', 'Writing', 'Revision', 'Quiz', 'Problem solving', 'Group discussion', 'Practical activity', 'Homework', 'Project', 'Other']));
    expect(checkActivity({ ...good, type: 'OTHER' })).toMatchObject({ ok: false, message: 'Describe the other kind of activity.' });
    expect(checkActivity({ ...good, type: 'OTHER', typeDescription: 'Role play' })).toMatchObject({ ok: true, value: { typeDescription: 'Role play' } });
  });

  it('records what the student did, with the tutor and Mentor remarks apart', () => {
    expect(checkResponse({ response: 'Did pages 1 and 2', completion: 'COMPLETED', tutorRemarks: 'Good' })).toMatchObject({ ok: true, value: { response: 'Did pages 1 and 2', completion: 'COMPLETED', tutorRemarks: 'Good', mentorRemarks: null, hasTutorRemarks: true, hasMentorRemarks: false } });
    expect(checkResponse({ completion: 'LATER' })).toMatchObject({ ok: false, message: expect.stringContaining('completed') });
    expect(checkResponse({ completion: 'PENDING', response: 'x'.repeat(2001) })).toMatchObject({ ok: false });
  });
});

describe('the voice recording', () => {
  it('recognises each supported audio type by its content', () => {
    expect(sniffAudio(MP3)?.mime).toBe('audio/mpeg');
    expect(sniffAudio(M4A)?.mime).toBe('audio/mp4');
    expect(sniffAudio(OGG)?.mime).toBe('audio/ogg');
    expect(sniffAudio(WEBM)?.mime).toBe('audio/webm');
    expect(sniffAudio(WAV)?.mime).toBe('audio/wav');
    expect(sniffAudio(AMR)?.mime).toBe('audio/amr');
    expect(sniffAudio(pad([0xff, 0xfb, 0x90]))?.mime).toBe('audio/mpeg');
    expect(sniffAudio(pad([0xff, 0xf1, 0x50]))?.mime).toBe('audio/aac');
    expect(sniffAudio(PDF)).toBeNull();
    expect(sniffAudio(Buffer.from('short'))).toBeNull();
  });

  it('accepts a real recording that says what it is, and gives the type it really is', () => {
    expect(checkAudio(MP3, 'audio/mpeg')).toEqual({ ok: true, mime: 'audio/mpeg', extension: '.mp3' });
    expect(checkAudio(M4A, 'audio/x-m4a')).toMatchObject({ ok: true, mime: 'audio/mp4' });
    expect(checkAudio(WEBM, 'audio/webm;codecs=opus')).toMatchObject({ ok: true, mime: 'audio/webm' });
    expect(checkAudio(WAV, 'AUDIO/WAV')).toMatchObject({ ok: true, mime: 'audio/wav' });
  });

  it('refuses an empty file, a file that is too big, a file that is not audio, and one that lies about its type', () => {
    expect(checkAudio(Buffer.alloc(0), 'audio/mpeg')).toMatchObject({ ok: false, code: 'EMPTY_FILE' });
    expect(checkAudio(null, 'audio/mpeg')).toMatchObject({ ok: false, code: 'EMPTY_FILE' });
    expect(checkAudio(Buffer.concat([MP3, Buffer.alloc(MAX_AUDIO_BYTES)]), 'audio/mpeg')).toMatchObject({ ok: false, code: 'FILE_TOO_LARGE' });
    expect(checkAudio(PDF, 'audio/mpeg')).toMatchObject({ ok: false, code: 'NOT_AUDIO', message: expect.stringContaining('MP3') });
    expect(checkAudio(PDF, 'application/pdf')).toMatchObject({ ok: false, code: 'NOT_AUDIO' });
    expect(checkAudio(MP3, 'audio/wav')).toMatchObject({ ok: false, code: 'FORGED_MIME_TYPE' });
    expect(checkAudio(MP3, '')).toMatchObject({ ok: false, code: 'FORGED_MIME_TYPE' });
    expect(checkAudio(Buffer.from('<script>alert(1)</script>'.padEnd(64, ' ')), 'audio/mpeg')).toMatchObject({ ok: false, code: 'NOT_AUDIO' });
  });

  it('never uses the uploaded name as a path', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\temp\\voice note (1).mp3')).toBe('voice_note__1_.mp3');
    expect(safeFileName('')).toBe('voice-update');
    expect(safeFileName('a'.repeat(300)).length).toBe(120);
  });
});

describe('message templates', () => {
  it('has a reminder, a class update in the approved format, and an activities message', () => {
    expect(DEFAULT_TEMPLATES.map((t) => t.key)).toEqual(['CLASS_REMINDER', 'CLASS_UPDATE', 'POST_CLASS_ACTIVITIES']);
    const update = DEFAULT_TEMPLATES.find((t) => t.key === 'CLASS_UPDATE')!;
    expect(update.body.split('\n')).toHaveLength(8);
    expect(update.body).toContain('𝐂𝐋𝐀𝐒𝐒 𝐔𝐏𝐃𝐀𝐓𝐄');
    expect(update.body).toContain('{{studentName}}');
    expect(update.body).toContain('{{practiceWork}}');
    for (const t of DEFAULT_TEMPLATES) expect(placeholdersIn(t.body).sort()).toEqual([...t.placeholders].sort());
  });

  it('fills a template from the class, and never uses an example name', () => {
    const t = DEFAULT_TEMPLATES.find((x) => x.key === 'CLASS_REMINDER')!;
    const r = renderTemplate(t.body, { studentName: 'Asha Menon', tutorName: 'Meera Thomas', subject: 'English', classDate: 'Monday, 9 November 2026', classTime: '3:00 PM to 4:00 PM', meetLink: 'https://meet.google.com/abc-defg-hij' });
    expect(r).toMatchObject({ ok: true });
    expect((r as { text: string }).text).toContain('Student: Asha Menon');
    expect((r as { text: string }).text).toContain('Meet link: https://meet.google.com/abc-defg-hij');
    expect((r as { text: string }).text).not.toContain('{{');
  });

  it('refuses to make up a missing value and says what to complete', () => {
    const t = DEFAULT_TEMPLATES.find((x) => x.key === 'CLASS_UPDATE')!;
    const r = renderTemplate(t.body, { studentName: 'Asha', tutorName: 'Meera', classDate: 'Monday', subject: 'English', duration: '1 h', topicsCovered: '', practiceWork: null });
    expect(r).toEqual({ ok: false, missing: ['topicsCovered', 'practiceWork'], message: 'Complete the topics covered, the practice work first.' });
  });

  it('lets a template be edited with known fields only, and at least one', () => {
    expect(checkTemplate({ name: 'Reminder', body: 'Class for {{studentName}} at {{classTime}}' })).toMatchObject({ ok: true });
    expect(checkTemplate({ name: 'Reminder', body: 'Hello {{parentName}}' })).toMatchObject({ ok: false, message: expect.stringContaining('parentName') });
    expect(checkTemplate({ name: 'Reminder', body: 'Plain text' })).toMatchObject({ ok: false, message: expect.stringContaining('at least one field') });
    expect(checkTemplate({ name: ' ', body: '{{studentName}}' })).toMatchObject({ ok: false, message: 'Give the template a name.' });
    expect(checkTemplate({ name: 'x', body: '' })).toMatchObject({ ok: false, message: 'Write the message.' });
  });
});

describe('verifying a class', () => {
  const ready: VerifyFacts = { conducted: true, tutorSubmitted: true, voiceUploaded: true, voiceShared: true, activitiesCreated: 3, activitiesShared: 3, exceptionApproved: false };
  const blockers = (over: Partial<VerifyFacts>) => verificationBlockers({ ...ready, ...over });

  it('is allowed only when the class was conducted, the update is in, the voice is uploaded and shared, and three activities are created and shared', () => {
    expect(blockers({})).toEqual([]);
    expect(MIN_ACTIVITIES).toBe(3);
  });

  it('names each thing that is missing', () => {
    expect(blockers({ conducted: null })).toEqual(['The class has not been recorded as conducted.']);
    expect(blockers({ conducted: false })).toEqual(['The class has not been recorded as conducted.']);
    expect(blockers({ tutorSubmitted: false })).toEqual(['The tutor class update has not been submitted.']);
    expect(blockers({ voiceUploaded: false, voiceShared: false })).toEqual(['The tutor voice recording has not been uploaded.']);
    expect(blockers({ voiceShared: false })).toEqual(['Sharing the voice recording in the group has not been confirmed.']);
    expect(blockers({ activitiesCreated: 2, activitiesShared: 2 })).toEqual(['At least 3 post-class activities are needed. 2 created.']);
    expect(blockers({ activitiesShared: 2 })).toEqual(['Sharing at least 3 activities in the group has not been confirmed. 2 confirmed.']);
    expect(blockers({ conducted: null, tutorSubmitted: false, voiceUploaded: false, voiceShared: false, activitiesCreated: 0, activitiesShared: 0 })).toHaveLength(4);
  });

  it('lets an approved exception lift the voice and activity conditions, and nothing else', () => {
    expect(blockers({ exceptionApproved: true, voiceUploaded: false, voiceShared: false, activitiesCreated: 0, activitiesShared: 0 })).toEqual([]);
    expect(blockers({ exceptionApproved: true, tutorSubmitted: false })).toEqual(['The tutor class update has not been submitted.']);
    expect(blockers({ exceptionApproved: true, conducted: null })).toEqual(['The class has not been recorded as conducted.']);
  });

  it('does not depend on what the student did with the activities', () => {
    // there is no student response in the facts at all: responses and completion cannot block a verification
    expect(Object.keys(ready)).not.toEqual(expect.arrayContaining(['responses', 'completed', 'studentCompleted']));
  });
});

describe('small inputs', () => {
  it('needs a reason, written in words', () => {
    expect(checkReason({ reason: ' The tutor was ill ' }, 'the class is being cancelled')).toEqual({ ok: true, value: 'The tutor was ill' });
    expect(checkReason({ reason: ' ' }, 'the class is being cancelled')).toEqual({ ok: false, message: 'Say why the class is being cancelled.' });
    expect(checkReason('plain text', 'x')).toEqual({ ok: true, value: 'plain text' });
    expect(checkReason({ reason: 'x'.repeat(1001) }, 'x')).toMatchObject({ ok: false });
  });

  it('takes an https meeting link, or clears it', () => {
    expect(checkMeetLink({ link: 'https://meet.google.com/abc-defg-hij' })).toEqual({ ok: true, value: 'https://meet.google.com/abc-defg-hij' });
    expect(checkMeetLink({ link: ' ' })).toEqual({ ok: true, value: null });
    expect(checkMeetLink({ link: 'http://meet.google.com/x' })).toMatchObject({ ok: false, message: expect.stringContaining('https://') });
    expect(checkMeetLink({ link: 'javascript:alert(1)' })).toMatchObject({ ok: false });
    expect(checkMeetLink({ link: 'meet please' })).toMatchObject({ ok: false, message: expect.stringContaining('full address') });
  });
});

// ─── Remediation of the Stage D review ───────────────────────────────────────────────────────────────────────────

describe('parseRange (HTTP Range for playback)', () => {
  it('means the whole file when there is no usable range', () => {
    for (const h of [undefined, null, '', 'items=0-5', 'bytes=', 'bytes=-', 'bytes=a-b', 'bytes=0-5,7-9', 'bytes 0-5', 'bytes=5-2']) expect(parseRange(h, 100)).toEqual({ kind: 'none' });
  });

  it('reads a closed range, an open ended range, a suffix range and cuts an end beyond the file', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ kind: 'ok', start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ kind: 'ok', start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ kind: 'ok', start: 90, end: 99 });
    expect(parseRange('bytes=-500', 100)).toEqual({ kind: 'ok', start: 0, end: 99 });
    expect(parseRange('bytes=50-5000', 100)).toEqual({ kind: 'ok', start: 50, end: 99 });
    expect(parseRange('bytes=99-99', 100)).toEqual({ kind: 'ok', start: 99, end: 99 });
    expect(parseRange(' bytes=0-0 ', 100)).toEqual({ kind: 'ok', start: 0, end: 0 });
  });

  it('is unsatisfiable when the start is at or past the end, for an empty suffix, and for an empty file', () => {
    expect(parseRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=500-900', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=0-5', 0)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=99999999999999999999-', 100)).toEqual({ kind: 'unsatisfiable' });
  });
});

describe('video is not accepted as a voice recording', () => {
  const box = (type: string, body: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + body.length, 0); h.write(type, 4, 'latin1'); return Buffer.concat([h, body]); };
  const mp4 = (handler: string) => Buffer.concat([box('ftyp', Buffer.from('M4A \u0000\u0000\u0000\u0000isom', 'latin1')), box('moov', box('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from(handler, 'latin1'), Buffer.alloc(12)]))), box('mdat', Buffer.alloc(200, 1))]);

  it('finds a video track in MP4, WebM and Ogg, and not in audio', () => {
    expect(hasVideoTrack(mp4('vide'))).toBe(true);
    expect(hasVideoTrack(mp4('soun'))).toBe(false);
    expect(hasVideoTrack(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(8), Buffer.from('V_MPEG4/ISO/AVC'), Buffer.alloc(100)]))).toBe(true);
    expect(hasVideoTrack(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(8), Buffer.from('A_OPUS'), Buffer.alloc(100)]))).toBe(false);
    expect(hasVideoTrack(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(8), Buffer.from('\u0080theora'), Buffer.alloc(100)]))).toBe(true);
    expect(hasVideoTrack(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(8), Buffer.from('OpusHead'), Buffer.alloc(100)]))).toBe(false);
    expect(hasVideoTrack(pad('ID3', 200))).toBe(false);
  });

  it('refuses video in checkAudio by MIME type, by container and in an MP4 whose name and type say audio', () => {
    for (const claimed of ['video/mp4', 'video/webm', 'VIDEO/QUICKTIME', 'video/mp4; codecs=avc1']) expect(checkAudio(mp4('soun'), claimed)).toMatchObject({ ok: false, code: 'VIDEO_NOT_ALLOWED' });
    expect(checkAudio(mp4('vide'), 'audio/mp4')).toMatchObject({ ok: false, code: 'VIDEO_NOT_ALLOWED' });
    expect(checkAudio(mp4('soun'), 'audio/mp4')).toMatchObject({ ok: true, mime: 'audio/mp4' });
  });

  it('no longer treats random bytes that start with 0xFF as an MP3', () => {
    expect(sniffAudio(Buffer.from([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // reserved bitrate and sample rate
    expect(sniffAudio(Buffer.from([0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // reserved version and layer
    expect(sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime).toBe('audio/mpeg'); // a real MPEG 1 layer III frame
  });
});

describe('the daily class cards, from one definition', () => {
  const base: CardClass = { date: '2026-11-09', status: 'SCHEDULED', state: 'SCHEDULED', moved: false, update: null, voice: { uploaded: false, shared: false }, activityCounts: { created: 0, shared: 0 }, exception: { status: null } };
  const cards = (over: Partial<CardClass>, today = '2026-11-09') => classCardsOf({ ...base, ...over }, today);

  it('puts a plain scheduled class in today or upcoming, and nothing else', () => {
    expect(cards({})).toEqual(['classes_today']);
    expect(cards({ date: '2026-11-10' })).toEqual(['classes_upcoming']);
    expect(cards({ date: '2026-11-08' })).toEqual([]);
  });

  it('puts a reported class in conducted, the voice and activity cards until they are done, and keeps a closed class out of them', () => {
    const reported = { update: { conducted: true }, status: 'AWAITING_MENTOR_VERIFICATION', state: 'AWAITING_MENTOR_VERIFICATION' };
    expect(cards(reported)).toEqual(expect.arrayContaining(['classes_awaiting_verification', 'classes_conducted', 'classes_voice_pending', 'classes_awaiting_activities']));
    expect(cards({ ...reported, voice: { uploaded: true, shared: false } })).toContain('classes_voice_pending');
    expect(cards({ ...reported, voice: { uploaded: true, shared: true } })).not.toContain('classes_voice_pending');
    expect(cards({ ...reported, activityCounts: { created: 3, shared: 2 } })).toContain('classes_awaiting_activities');
    expect(cards({ ...reported, activityCounts: { created: 3, shared: 3 } })).not.toContain('classes_awaiting_activities');
    expect(cards({ ...reported, exception: { status: 'APPROVED' } })).not.toEqual(expect.arrayContaining(['classes_voice_pending']));
    expect(cards({ ...reported, exception: { status: 'REQUESTED' } })).toContain('classes_voice_pending');
    const verified = cards({ ...reported, status: 'VERIFIED', state: 'VERIFIED' });
    expect(verified).toEqual(expect.arrayContaining(['classes_verified', 'classes_conducted']));
    expect(verified).not.toContain('classes_voice_pending');
  });

  it('keeps a cancelled class out of today, and counts moved, not conducted and cancelled classes in their own cards', () => {
    expect(cards({ status: 'CANCELLED', state: 'CANCELLED' })).toEqual(['classes_cancelled']);
    expect(cards({ moved: true, status: 'RESCHEDULED', state: 'RESCHEDULED' })).toEqual(expect.arrayContaining(['classes_rescheduled', 'classes_today']));
    expect(cards({ state: 'NOT_CONDUCTED', status: 'NOT_CONDUCTED', update: { conducted: false } })).toContain('classes_not_conducted');
  });

  it('names every class card the dashboard has', () => {
    expect([...CLASS_CARD_KEYS]).toHaveLength(11);
    const dashboard = readFileSync(join(__dirname, 'mentoring-dashboard.service.ts'), 'utf8');
    for (const key of CLASS_CARD_KEYS) expect(dashboard).toContain(`'${key}'`);
  });
});
