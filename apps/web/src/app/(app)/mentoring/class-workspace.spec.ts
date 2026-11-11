import { readFileSync } from 'fs';
import { join } from 'path';

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { fetchApi } from '@/lib/api/client';

import { ReviewPanel, MessageBlock } from './ClassWorkspaceDrawer';
import { FollowUps, StatusStrip, VersionHistory } from './ClassWorkspaceExtras';
import { classCardHref, CLASS_CARD_KEYS, emptyFilters } from './dashboard-view';
import { ClassListClient } from './classes/ClassListClient';
import { CardGrid } from './dashboard/DashboardClient';
import { ACTIVITIES, STATE_CHOICES, STATE_TONE, draftFromClass, payloadOfUpdate, updateProblems } from './class-view';
import { recordLabel } from './timetable-view';
import {
  ACTIVITY_CHOICES, FollowUpInfo, VersionInfo, emptyFollowUp, followUpProblems, payloadOfFollowUp, MessagePreview, ShareInfo, SHARE_STATE, WorkspaceData, exceptionKind, activityProblems, audioProblem, audioUrl, draftOfActivity, emptyActivity, emptyListFilters, fileSizeText, listQuery, payloadOfActivity, verifyHint, voiceUploadUrl, workspaceBase,
} from './workspace-view';
import { tutorPortalApiAction } from '../tutor-portal/actions';

jest.mock('@/lib/api/client', () => ({ fetchApi: jest.fn() }));
jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));
jest.mock('../tutor-portal/client', () => ({ tutorPortalApi: jest.fn().mockResolvedValue({}) }));

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const KEY = 'as-class-A~2026-11-09~900';

describe('the class workspace request helpers', () => {
  it('sends a tutor to the tutor routes and a Mentor to the Mentoring routes, and a recording to this app first', () => {
    expect(workspaceBase('TUTOR')).toBe('/tutor-portal/class-workspace');
    expect(workspaceBase('MENTOR')).toBe('/mentoring/class-workspace');
    expect(audioUrl('TUTOR', 'abc-123')).toBe('/api/class-audio/tutor/abc-123');
    expect(audioUrl('MENTOR', 'a b')).toBe('/api/class-audio/mentoring/a%20b');
    expect(voiceUploadUrl(KEY)).toBe(`/api/class-voice/${encodeURIComponent(KEY)}`);
  });

  it('builds the list query from the filters, leaving empty ones out and encoding the rest', () => {
    const f = { ...emptyListFilters('2026-11-09'), studentQuery: 'asha & co', state: 'CANCELLED' };
    expect(listQuery(f, 2)).toBe('?date=2026-11-09&studentQuery=asha%20%26%20co&state=CANCELLED&page=2');
    expect(listQuery(emptyListFilters('2026-11-09'))).toBe('?date=2026-11-09&page=1');
  });

  it('describes what was done to a message without ever saying it was delivered', () => {
    const share = (over: Partial<ShareInfo>): ShareInfo => ({ id: 's1', text: 'x', preparedBy: null, preparedAt: '2026-11-09T09:00:00Z', copiedAt: null, confirmedAt: null, confirmedBy: null, ...over });
    expect(SHARE_STATE(null)).toBe('Not prepared');
    expect(SHARE_STATE(share({}))).toBe('Prepared, not copied');
    expect(SHARE_STATE(share({ copiedAt: '2026-11-09T09:01:00Z' }))).toBe('Copied, not yet confirmed as shared');
    expect(SHARE_STATE(share({ copiedAt: 'x', confirmedAt: 'y' }))).toBe('Shared, confirmed');
    for (const s of [null, share({}), share({ copiedAt: 'x' }), share({ confirmedAt: 'y' })]) expect(SHARE_STATE(s)).not.toMatch(/deliver|read by/i);
  });
});

describe('the voice file checks before upload', () => {
  it('stops an empty file, a file over 15 MB and no file, and lets a normal one through', () => {
    expect(audioProblem(null)).toBe('Choose a recording first.');
    expect(audioProblem({ name: 'a.mp3', size: 0 })).toBe('That file is empty.');
    expect(audioProblem({ name: 'a.mp3', size: 15 * 1024 * 1024 + 1 })).toBe('The recording is larger than 15 MB.');
    expect(audioProblem({ name: 'a.mp3', size: 2 * 1024 * 1024 })).toBeNull();
    expect(fileSizeText(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(fileSizeText(10)).toBe('1 KB');
  });
});

describe('the activity form', () => {
  it('names what is missing, needs a description for Other, and sends only what applies', () => {
    expect(activityProblems(emptyActivity())).toEqual(['a title', 'the topic', 'the instructions', 'the grade it suits', 'the learning level']);
    const d = { ...emptyActivity('g-8'), title: 'Tenses', topic: 'Tenses', instructions: 'Do page 4', type: 'OTHER', learningLevel: 'ON_GRADE' };
    expect(activityProblems(d)).toEqual(['a description of the other kind']);
    expect(payloadOfActivity({ ...d, typeDescription: 'Role play', dueDate: '2026-11-12' })).toEqual({ title: 'Tenses', type: 'OTHER', topic: 'Tenses', instructions: 'Do page 4', typeDescription: 'Role play', dueDate: '2026-11-12', gradeId: 'g-8', learningLevel: 'ON_GRADE' });
    expect(payloadOfActivity({ ...d, type: 'WORKSHEET', typeDescription: 'ignored' })).toEqual({ title: 'Tenses', type: 'WORKSHEET', topic: 'Tenses', instructions: 'Do page 4', gradeId: 'g-8', learningLevel: 'ON_GRADE' });
    expect(draftOfActivity({ id: 'a', position: 1, title: 'T', type: 'QUIZ', typeLabel: 'Quiz', typeDescription: null, topic: 'X', instructions: 'Y', dueDate: null, sharedAt: null, sharedBy: null, studentResponse: null, respondedAt: null, completion: 'PENDING', completionLabel: 'Not yet done', tutorRemarks: null, mentorRemarks: null })).toMatchObject({ type: 'QUIZ', dueDate: '', typeDescription: '' });
  });

  it('shows the server blockers as they are, or says everything is in place', () => {
    const review = (blockers: string[]) => ({ blockers } as WorkspaceData['review']);
    expect(verifyHint(review(['The tutor voice recording has not been uploaded.', 'At least 3 post-class activities are needed. 1 created.']))).toBe('The tutor voice recording has not been uploaded. At least 3 post-class activities are needed. 1 created.');
    expect(verifyHint(review([]))).toBe('Everything needed to verify this class is in place.');
  });
});

describe('a message block', () => {
  const run = jest.fn();
  const preview = (over: Partial<MessagePreview> = {}): MessagePreview => ({ key: 'CLASS_REMINDER', name: 'Class reminder', ok: true, text: 'Student: Asha Menon', missing: [], message: null, placeholders: [], share: null, ...over });
  const html = (m: MessagePreview, props: Partial<React.ComponentProps<typeof MessageBlock>> = {}) => renderToStaticMarkup(React.createElement(MessageBlock, { role: 'TUTOR', classKey: KEY, m, busy: false, canAct: true, run, ...props }));

  it('shows the real message, a copy button and a separate confirmation that stays off until something was prepared', () => {
    const out = html(preview());
    expect(out).toContain('Student: Asha Menon');
    expect(out).toContain('Copy message');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>I shared it in the group/);
    expect(out).toContain('Not prepared');
  });

  it('says what is missing instead of making a message up, and asks for the Meet link', () => {
    const out = html(preview({ ok: false, text: null, missing: ['meetLink'], message: 'Complete the Meet link first.' }), { needsLink: true });
    expect(out).toContain('Complete the Meet link first.');
    expect(out).toContain('Meet link for this class');
    expect(out).not.toContain('Student: Asha Menon');
  });

  it('records who confirmed sharing and says it is a record of what was said, not proof of reading', () => {
    const out = html(preview({ share: { id: 's1', text: 'x', preparedBy: 'Meera Thomas', preparedAt: '2026-11-09T09:00:00Z', copiedAt: '2026-11-09T09:01:00Z', confirmedAt: '2026-11-09T09:05:00Z', confirmedBy: 'Meera Thomas' } }));
    expect(out).toContain('Shared, confirmed');
    expect(out).toContain('Recorded as shared by Meera Thomas on 2026-11-09 09:05 UTC');
    expect(out).toContain('not proof that anyone read it');
    expect(out).not.toMatch(/\bdelivered\b/i);
  });

  it('shows no buttons to someone who may only look', () => {
    const out = html(preview(), { canAct: false });
    expect(out).not.toContain('Copy message');
    expect(out).not.toContain('I shared it in the group');
  });
});

describe('the class states', () => {
  it('knows a cancelled class', () => {
    expect(STATE_CHOICES.map(([k]) => k)).toContain('CANCELLED');
    expect(STATE_TONE.CANCELLED).toBe('default');
  });
});

describe('the tutor portal bridge for the class workspace', () => {
  const mocked = fetchApi as jest.Mock;
  beforeEach(() => mocked.mockReset().mockResolvedValue({ ok: true }));
  const KEYP = encodeURIComponent(KEY).replace(/%7E/g, '~');
  const allowed: Array<[string, 'GET' | 'POST' | 'PUT']> = [
    [`/tutor-portal/class-workspace/${KEYP}`, 'GET'], [`/tutor-portal/class-workspace/${KEYP}/shares`, 'POST'], [`/tutor-portal/class-workspace/${KEYP}/activities`, 'POST'], [`/tutor-portal/class-workspace/${KEYP}/voice/shared`, 'POST'],
    ['/tutor-portal/class-workspace/shares/abcdef12345/copied', 'POST'], ['/tutor-portal/class-workspace/shares/abcdef12345/confirm', 'POST'],
    ['/tutor-portal/class-workspace/activities/abcdef12345', 'PUT'], ['/tutor-portal/class-workspace/activities/abcdef12345/response', 'PUT'], ['/tutor-portal/class-workspace/activities/abcdef12345/remove', 'POST'], ['/tutor-portal/class-workspace/activities/abcdef12345/shared', 'POST'],
  ];
  it.each(allowed)('forwards %s', async (path, method) => {
    await expect(tutorPortalApiAction(path, method)).resolves.toMatchObject({ ok: true });
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it('refuses a wrong method, a path that goes elsewhere, the audio route and the voice upload (those have their own routes)', async () => {
    for (const [path, method] of [
      [`/tutor-portal/class-workspace/${KEYP}`, 'POST'], ['/tutor-portal/class-workspace/shares/abcdef12345/confirm', 'PUT'], ['/tutor-portal/class-workspace/../exams/x', 'GET'], ['/tutor-portal/class-workspace/audio/abcdef12345', 'GET'],
      [`/tutor-portal/class-workspace/${KEYP}/voice`, 'POST'], ['/tutor-portal/class-workspace/activities/abcdef12345/other', 'PUT'], ['/mentoring/class-workspace/list', 'GET'],
    ] as Array<[string, 'GET' | 'POST' | 'PUT']>) {
      await expect(tutorPortalApiAction(path, method)).resolves.toMatchObject({ ok: false });
    }
    expect(mocked).not.toHaveBeenCalled();
  });
});

describe('the recording routes', () => {
  const audio = read('../../api/class-audio/[scope]/[id]/route.ts');
  const upload = read('../../api/class-voice/[key]/route.ts');

  it('play only for a signed-in user, only audio, with no sniffing and no caching, and hide a refusal as not found', () => {
    expect(audio).toContain("cookies().get('accessToken')");
    expect(audio).toContain("return new NextResponse('Unauthorized', { status: 401 })");
    expect(audio).toContain('audio\\/');
    expect(audio).toContain("'X-Content-Type-Options', 'nosniff'");
    expect(audio).toContain("'Cache-Control', 'private, no-cache, no-store, must-revalidate'");
    expect(audio).toContain('res.status === 403 ? 404');
    expect(audio).toMatch(/ROUTES: Record<string, string> = \{ tutor: '\/tutor-portal\/class-workspace\/audio', mentoring: '\/mentoring\/class-workspace\/audio' \}/);
  });

  it('upload only for a signed-in user, to the tutor route, with the class key checked and the size capped', () => {
    expect(upload).toContain("cookies().get('accessToken')");
    expect(upload).toContain('/tutor-portal/class-workspace/');
    expect(upload).toContain('const KEY = /^[A-Za-z0-9-]{8,64}~');
    expect(upload).toContain('15 * 1024 * 1024');
    expect(upload).toContain('status: 413');
  });

  it('never put the user, the token or a file path in an address', () => {
    for (const source of [audio, upload]) expect(source).not.toMatch(/\?token=|searchParams|path\.join|readFile/);
  });
});

describe('the words on the workspace screens', () => {
  const files = ['ClassWorkspaceDrawer.tsx', 'ClassWorkspaceExtras.tsx', 'classes/ClassListClient.tsx', 'workspace-view.ts'];
  const strings = (source: string) => [...source.matchAll(/'([^'\n]{12,})'|>([^<>{}\n]{12,})</g)].map((m) => m[1] ?? m[2]);

  it.each(files)('%s has no em dash, en dash, emoji, curly quote or chatbot phrase in what it says', (file) => {
    const copy = strings(read(file)).join('\n');
    expect(copy).not.toMatch(/[–—]/);
    expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(copy).not.toMatch(/[‘’“”]/);
    expect(copy).not.toMatch(/\b(delve|seamless|robust|leverage|great question|i hope this helps|certainly!)\b/i);
  });

  it('claims no delivery and offers no automatic sending', () => {
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/Send via WhatsApp|auto-?send|was delivered|has been delivered|message sent/i);
    }
  });

  it('is reached from the daily class panel, the tutor classes, the dashboard and the Mentoring home', () => {
    expect(read('students/[id]/DailyClassesPanel.tsx')).toContain('<ClassWorkspaceDrawer role="MENTOR"');
    expect(read('../tutor-portal/TutorClasses.tsx')).toContain('<ClassWorkspaceDrawer role="TUTOR"');
    expect(read('dashboard/DashboardClient.tsx')).toContain('href="/mentoring/classes"');
    expect(read('page.tsx')).toContain("href: '/mentoring/classes'");
  });
});

// ─── Remediation of the Stage D review ───────────────────────────────────────────────────────────────────────────
describe('C1: the exception form and what it says, from the contract the API sends', () => {
  const review = (exception: Partial<WorkspaceData['review']['exception']>, over: Partial<WorkspaceData> = {}) => ({
    class: { sessionId: 'sess-1', status: 'AWAITING_MENTOR_VERIFICATION', checklist: [], subjectName: 'English', studentName: 'Asha', date: '2026-11-09', startMinute: 900, endMinute: 960 },
    review: {
      blockers: ['The tutor voice recording has not been uploaded.'], canVerify: false, mentorRemarks: null, cancelled: null, consumption: 'NOT_CONSUMED', minutes: { scheduled: 60, reported: 65, verified: null, consumed: 0 },
      exception: { status: null, reason: null, requestedBy: null, requestedAt: null, decidedBy: null, decidedAt: null, decisionNote: null, ...exception },
    },
    canWork: true, canDecideException: false, ...over,
  } as unknown as WorkspaceData);
  const html = (w: WorkspaceData) => renderToStaticMarkup(React.createElement(ReviewPanel, { w, classKey: KEY, busy: false, canWork: !!w.canWork, run: jest.fn(), onClosed: jest.fn() }));

  it('treats the null the API sends as no exception: the request form shows and no decision is claimed', () => {
    expect(exceptionKind(null)).toBe('NONE');
    expect(exceptionKind(undefined)).toBe('NONE');
    expect(exceptionKind({ status: null })).toBe('NONE');
    const out = html(review({ status: null }));
    expect(out).toContain('Request exception');
    expect(out).toContain('Ask the Mentoring Head for an exception');
    expect(out).not.toContain('data-testid="exception-state"');
    expect(out).not.toMatch(/Exception (requested|approved|rejected)/);
  });

  it('says requested, approved and rejected with who and why, and shows the decision buttons only to someone who can decide', () => {
    const asked = { reason: 'No data connection', requestedBy: 'Mira Staff', requestedAt: '2026-11-09T12:00:00Z' };
    const requested = html(review({ status: 'REQUESTED', ...asked }));
    expect(requested).toContain('Exception requested. Asked by Mira Staff');
    expect(requested).not.toContain('Request exception');
    expect(requested).not.toContain('Approve exception');
    const head = html(review({ status: 'REQUESTED', ...asked }, { canDecideException: true }));
    expect(head).toContain('Approve exception');
    expect(head).toContain('Reject exception');
    expect(html(review({ status: 'APPROVED', ...asked, decidedBy: 'Hari Staff', decidedAt: '2026-11-09T13:00:00Z', decisionNote: 'Agreed' }))).toContain('Exception approved. Asked by Mira Staff');
    const rejected = html(review({ status: 'REJECTED', ...asked, decidedBy: 'Hari Staff', decidedAt: '2026-11-09T13:00:00Z', decisionNote: 'Record it' }));
    expect(rejected).toContain('Exception rejected');
    expect(rejected).toContain('Request exception'); // a rejected request can be asked again
  });

  it('does not offer the request form to someone who cannot work on the class, or once the class is verified', () => {
    expect(html(review({ status: null }, { canWork: false }))).not.toContain('Request exception');
    const verified = review({ status: null });
    (verified.class as { status: string }).status = 'VERIFIED';
    expect(html(verified)).not.toContain('Request exception');
  });
});

describe('C2: the activity kinds the form offers are the ones the API accepts', () => {
  const apiSource = readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/class-workspace.ts'), 'utf8');
  const apiTypes = [...(/ACTIVITY_TYPES = \[([^\]]+)\]/.exec(apiSource)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  const migration = readFileSync(join(__dirname, '../../../../../api/prisma/migrations/20261116100000_add_mentoring_class_workspace/migration.sql'), 'utf8');
  const dbTypes = [...(/mentoring_class_activities_type_check" CHECK \("type" IN \(([^)]+)\)/.exec(migration)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

  it('offers exactly the API and database codes, in a way that can be checked', () => {
    expect(apiTypes).toHaveLength(13);
    expect(dbTypes).toEqual(apiTypes);
    expect(ACTIVITY_CHOICES.map(([code]) => code)).toEqual(apiTypes);
    expect(ACTIVITY_CHOICES.map(([code]) => code)).not.toContain('EDUCATIONAL_GAMES');
    expect(ACTIVITY_CHOICES.map(([code]) => code)).not.toContain('PROJECT_WORK');
  });

  it('sends the corrected codes for the two that were wrong, and every offered kind builds a valid request', () => {
    for (const [code] of ACTIVITY_CHOICES) {
      const d = { ...emptyActivity('g-8'), learningLevel: 'ON_GRADE', title: 'T', topic: 'X', instructions: 'Do it', type: code, typeDescription: code === 'OTHER' ? 'Role play' : '' };
      expect(activityProblems(d)).toEqual([]);
      expect(payloadOfActivity(d)).toMatchObject({ type: code });
      expect(apiTypes).toContain((payloadOfActivity(d) as { type: string }).type);
    }
    expect(payloadOfActivity({ ...emptyActivity(), title: 'T', topic: 'X', instructions: 'Do it', type: 'EDUCATIONAL_GAME' })).toMatchObject({ type: 'EDUCATIONAL_GAME' });
    expect(payloadOfActivity({ ...emptyActivity(), title: 'T', topic: 'X', instructions: 'Do it', type: 'PROJECT' })).toMatchObject({ type: 'PROJECT' });
  });

  it('keeps the drawer off the tutor update list, which uses other codes', () => {
    const drawer = read('ClassWorkspaceDrawer.tsx');
    expect(drawer).not.toMatch(/import \{[^}]*\bACTIVITIES\b[^}]*\} from '\.\/class-view'/);
    expect(drawer).toContain('ACTIVITY_CHOICES.map');
    expect(ACTIVITIES.map(([c]) => c)).toContain('EDUCATIONAL_GAMES'); // the tutor update keeps its own words, untouched
  });
});

describe('H2: dashboard cards open the Daily classes page with their dates, card and filters', () => {
  const summary = { today: '2026-11-09', window: { from: '2026-11-09', to: '2026-11-15' } };
  const none = { classState: '', studentQuery: '' };

  it('builds the address from the window, the card and the filters the dashboard had', () => {
    expect(classCardHref({ key: 'classes_voice_pending' }, summary, none)).toBe('/mentoring/classes?from=2026-11-09&to=2026-11-15&card=classes_voice_pending');
    expect(classCardHref({ key: 'classes_cancelled' }, summary, { classState: 'CANCELLED', studentQuery: 'asha & co' }, 'mentor-1')).toBe('/mentoring/classes?from=2026-11-09&to=2026-11-15&card=classes_cancelled&state=CANCELLED&studentQuery=asha%20%26%20co&mentorUserId=mentor-1');
  });

  it('uses today and the next seven days when the dashboard has no window, as the dashboard counts', () => {
    expect(classCardHref({ key: 'classes_today' }, { today: '2026-11-09', window: null }, none)).toBe('/mentoring/classes?from=2026-11-09&to=2026-11-16&card=classes_today');
    expect(classCardHref({ key: 'classes_upcoming' }, { today: '2026-12-28', window: null }, none)).toBe('/mentoring/classes?from=2026-12-28&to=2027-01-04&card=classes_upcoming');
  });

  it('gives every daily class card an address and no other card one', () => {
    for (const key of CLASS_CARD_KEYS) expect(classCardHref({ key }, summary, none)).toMatch(new RegExp(`^/mentoring/classes\\?from=.*&card=${key}$`));
    expect(CLASS_CARD_KEYS).toHaveLength(11);
    for (const key of ['students_total', 'exams_upcoming', 'meetings_overdue', 'complaints_new', 'sla_breached']) expect(classCardHref({ key }, summary, none)).toBeNull();
  });

  it('knows the same card keys as the API, so no card is missed', () => {
    const api = readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/class-workspace.ts'), 'utf8');
    const apiKeys = [...(/CLASS_CARD_KEYS = \[([^\]]+)\]/.exec(api)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...CLASS_CARD_KEYS]).toEqual(apiKeys);
  });

  it('renders each daily class card as a link to that address and every other card as a button', () => {
    const cards = [
      { key: 'classes_cancelled', group: 'classes', label: 'Classes cancelled', count: 2 }, { key: 'classes_voice_pending', group: 'classes', label: 'Waiting for the voice recording', count: 1 },
      { key: 'exams_upcoming', group: 'exams', label: 'Upcoming exams', count: 3 },
    ];
    const out = renderToStaticMarkup(React.createElement(CardGrid, { summary: { asOf: '', ...summary, cards, notRecorded: [] } as never, selected: null, onOpen: jest.fn(), filters: { ...emptyFilters(), classState: 'CANCELLED' } }));
    expect(out).toContain('href="/mentoring/classes?from=2026-11-09&amp;to=2026-11-15&amp;card=classes_cancelled&amp;state=CANCELLED"');
    expect(out).toContain('href="/mentoring/classes?from=2026-11-09&amp;to=2026-11-15&amp;card=classes_voice_pending&amp;state=CANCELLED"');
    expect(out).toMatch(/<button[^>]*data-key="exams_upcoming"/);
    expect(out).not.toMatch(/<button[^>]*data-key="classes_cancelled"/);
  });

  it('opens the list on the card, the dates and the filters it was given, and shows what it is showing', () => {
    const out = renderToStaticMarkup(React.createElement(ClassListClient, { initialFrom: '2026-11-09', initialTo: '2026-11-15', initialCard: 'classes_voice_pending', initialState: 'AWAITING_MENTOR_VERIFICATION', initialMentor: 'mentor-1', initialStudent: 'asha' }));
    expect(out).toContain('data-testid="card-banner"');
    expect(out).toContain('Showing: Waiting for the voice recording.');
    expect(out).toContain('Show one day instead');
    expect(out).toContain('Clear the filters');
    expect(out).toContain('value="asha"');
    expect(renderToStaticMarkup(React.createElement(ClassListClient, { initialCard: 'classes_made_up', initialFrom: 'soon' }))).not.toContain('card-banner');
  });

  it('asks the API for a range and a card, and for a single day when there is none', () => {
    const f = { ...emptyListFilters('2026-11-09'), from: '2026-11-09', to: '2026-11-15', card: 'classes_cancelled', state: 'CANCELLED' };
    expect(listQuery(f)).toBe('?from=2026-11-09&to=2026-11-15&card=classes_cancelled&state=CANCELLED&page=1');
    expect(listQuery(f)).not.toContain('date=');
    expect(listQuery(emptyListFilters('2026-11-09'), 3)).toBe('?date=2026-11-09&page=3');
  });

  it('is reached from the dashboard page without a record list in between for those cards', () => {
    const client = read('dashboard/DashboardClient.tsx');
    expect(client).toContain('classCardHref(c, summary, filters)');
    expect(client).toContain('filters={filters}');
  });
});

describe('10: the student timetable shows consumed and cancelled classes', () => {
  it('says what the stored class record says, in words, and nothing for a class nothing has happened to', () => {
    expect(recordLabel({})).toBeNull();
    expect(recordLabel({ consumption: 'NOT_CONSUMED', classRecordStatus: null })).toBeNull();
    expect(recordLabel({ consumption: 'CONSUMED', classRecordStatus: 'VERIFIED' })).toBe('Consumed, verified by the Mentor');
    expect(recordLabel({ consumption: 'NOT_CONSUMED', classRecordStatus: 'CANCELLED' })).toBe('Cancelled, not consumed');
    expect(recordLabel({ consumption: 'NOT_CONSUMED', classRecordStatus: 'NOT_CONDUCTED' })).toBe('Not conducted, not consumed');
    expect(recordLabel({ consumption: 'NOT_CONSUMED', classRecordStatus: 'AWAITING_MENTOR_VERIFICATION' })).toBe('Not consumed until the Mentor verifies it');
    expect(recordLabel({ consumption: 'NOT_CONSUMED', classRecordStatus: 'VERIFIED' })).toBe('Not consumed until the Mentor verifies it'); // verified for no minutes
  });

  it('is shown on the class card and in its details, and a cancelled class is struck through', () => {
    const panel = read('students/[id]/TimetablePanel.tsx');
    expect(panel).toContain('data-testid="record-state"');
    expect(panel).toContain("['Class record', recordLabel(e)");
    expect(panel).toContain("e.classRecordStatus === 'CANCELLED'");
  });
});

describe('H1: the recording route passes ranges on', () => {
  const audio = read('../../api/class-audio/[scope]/[id]/route.ts');
  jest.mock('next/headers', () => ({ cookies: () => ({ get: (n: string) => (n === 'accessToken' ? { value: 'tok' } : undefined) }) }));
  jest.mock('@/lib/api/server-api-url', () => ({ resolveServerApiUrl: () => 'http://api.test' }));
  jest.mock('@/lib/api/proxy-error', () => ({ proxyExceptionResponse: () => new Response('proxy error', { status: 502 }) }));

  const call = async (range: string | null, backend: Response) => {
    const fetchMock = jest.fn().mockResolvedValue(backend);
    (global as { fetch: unknown }).fetch = fetchMock;
    const { GET } = await import('../../api/class-audio/[scope]/[id]/route');
    const req = { headers: { get: (n: string) => (n.toLowerCase() === 'range' ? range : null) } } as never;
    const res = await GET(req, { params: { scope: 'tutor', id: 'abcdef12345' } });
    return { res, fetchMock };
  };
  const audioHead = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' };

  it('forwards a well formed Range header, and none that is not', async () => {
    let { fetchMock } = await call('bytes=0-9', new Response('0123456789', { status: 206, headers: { ...audioHead, 'Content-Range': 'bytes 0-9/100', 'Content-Length': '10' } }));
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok', Range: 'bytes=0-9' });
    ({ fetchMock } = await call('bytes=0-9;evil', new Response('x', { status: 200, headers: audioHead })));
    expect(fetchMock.mock.calls[0][1].headers.Range).toBeUndefined();
    ({ fetchMock } = await call(null, new Response('x', { status: 200, headers: audioHead })));
    expect(fetchMock.mock.calls[0][1].headers.Range).toBeUndefined();
  });

  it('answers 206 with Content-Range, Content-Length and Accept-Ranges, and streams the part', async () => {
    const { res } = await call('bytes=0-9', new Response('0123456789', { status: 206, headers: { ...audioHead, 'Content-Range': 'bytes 0-9/100', 'Content-Length': '10' } }));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-9/100');
    expect(res.headers.get('Content-Length')).toBe('10');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache, no-store, must-revalidate');
    expect(await res.text()).toBe('0123456789');
  });

  it('answers 200 with Accept-Ranges for the whole file, and 416 with the size for a range past the end', async () => {
    const whole = await call(null, new Response('abc', { status: 200, headers: { ...audioHead, 'Content-Length': '3' } }));
    expect(whole.res.status).toBe(200);
    expect(whole.res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(whole.res.headers.get('Content-Range')).toBeNull();
    const past = await call('bytes=999-', new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */100' } }));
    expect(past.res.status).toBe(416);
    expect(past.res.headers.get('Content-Range')).toBe('bytes */100');
    expect(past.res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('shows a refusal as not found, refuses a type that is not audio, and never passes on a forged Content-Range', async () => {
    expect((await call('bytes=0-9', new Response('no', { status: 403 }))).res.status).toBe(404);
    expect((await call('bytes=0-9', new Response('no', { status: 404 }))).res.status).toBe(404);
    expect((await call(null, new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))).res.status).toBe(404);
    const forged = await call('bytes=0-9', new Response('0123456789', { status: 206, headers: { ...audioHead, 'Content-Range': 'bytes 0-9/100, evil=1' } }));
    expect(forged.res.status).toBe(206);
    expect(forged.res.headers.get('Set-Cookie')).toBeNull();
    expect(forged.res.headers.get('Content-Range')).toBeNull();
  });

  it('answers 401 with no sign in, and does not buffer the whole file', () => {
    expect(audio).toContain("return new NextResponse('Unauthorized', { status: 401 })");
    expect(audio).not.toContain('arrayBuffer()');
    expect(audio).toContain('new NextResponse(res.body');
  });
});

describe('legacy classes in the review screen', () => {
  it('says why a class cannot be verified yet, points to the class workspace, and keeps Verify off until the server would accept it', () => {
    const panel = read('students/[id]/DailyClassesPanel.tsx');
    expect(panel).toContain('Open the class workspace to add what is missing');
    expect(panel).toContain('(c.blockers ?? []).length > 0');
    expect(panel).toContain('data-testid="verify-blockers"');
  });
});

// ─── Stage 1 screens ─────────────────────────────────────────────────────────────────────────────────────────────
describe('Stage 1: the two statuses, side by side', () => {
  const cls = (over: object = {}) => ({ classStatus: 'CONDUCTED', classStatusLabel: 'Conducted', documentation: { status: 'IN_PROGRESS', label: 'In progress', missing: ['The tutor voice recording has not been uploaded.'] }, ...over } as unknown as WorkspaceData['class']);
  const html = (c: WorkspaceData['class']) => renderToStaticMarkup(React.createElement(StatusStrip, { c }));

  it('shows whether the class took place and whether its paperwork is complete as separate facts, with what is missing', () => {
    const out = html(cls());
    expect(out).toContain('data-testid="class-status"');
    expect(out).toContain('Conducted');
    expect(out).toContain('data-testid="documentation-status"');
    expect(out).toContain('In progress');
    expect(out).toContain('The tutor voice recording has not been uploaded.');
  });

  it('shows a conducted class with complete paperwork, and a class that was not conducted with none required, without a list of missing things', () => {
    const complete = html(cls({ documentation: { status: 'COMPLETE', label: 'Complete', missing: [] } }));
    expect(complete).toContain('Complete');
    expect(complete).not.toContain('documentation-missing');
    const none = html(cls({ classStatus: 'NOT_CONDUCTED', classStatusLabel: 'Not conducted', documentation: { status: 'NOT_REQUIRED', label: 'Not required', missing: ['ignored'] } }));
    expect(none).toContain('Not conducted');
    expect(none).toContain('Not required');
    expect(none).not.toContain('ignored');
  });

  it('shows nothing for an answer from an older server that has no statuses', () => {
    expect(html({} as WorkspaceData['class'])).toBe('');
  });

  it('puts the same two columns in the daily class list', () => {
    const list = read('classes/ClassListClient.tsx');
    expect(list).toContain("'Class', 'Documentation', 'Status'");
    expect(list).toContain('data-testid="row-class-status"');
    expect(list).toContain('data-testid="row-documentation-status"');
  });
});

describe('Stage 1: the update form', () => {
  const empty = draftFromClass({ update: null });
  const good = { ...empty, conducted: 'yes' as const, actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT', participation: 'GOOD', portionsCompleted: 'Chapter 3', homework: 'Worksheet 4', classNotes: 'None' };

  it('asks for the portions, the participation, the homework and the additional remarks, and takes None', () => {
    expect(updateProblems(good)).toEqual([]);
    expect(updateProblems({ ...good, portionsCompleted: ' ' })).toEqual(['the portions completed']);
    expect(updateProblems({ ...good, participation: '' })).toEqual(['student participation']);
    expect(updateProblems({ ...good, homework: '' })).toEqual(['the homework, or None']);
    expect(updateProblems({ ...good, classNotes: '' })).toEqual(['your additional remarks, or None']);
  });

  it('asks what changed when an update was already submitted, and sends the version the tutor was looking at', () => {
    const submitted = draftFromClass({ update: { conducted: true, actualStartMinute: 905, actualEndMinute: 970, actualMinutes: 65, subjectCovered: null, topicsCovered: 'Tenses', attendance: 'PRESENT', participation: 'GOOD', classNotes: 'None', notConductedReason: null, activities: [], otherActivity: null, evaluationRemarks: null, coveredRemarks: null, voice: { sentAt: null, receivedAt: null, remarks: null }, submittedAt: '2026-11-09T10:00:00Z', homework: 'Worksheet 4', portionsCompleted: 'Chapter 3', chapters: ['Tenses', 'Nouns'], version: 3 } });
    expect(submitted).toMatchObject({ resubmitting: true, expectedVersion: 3, homework: 'Worksheet 4', portionsCompleted: 'Chapter 3', chapters: 'Tenses\nNouns', resubmitReason: '' });
    expect(updateProblems(submitted)).toEqual(['what you changed']);
    const again = { ...submitted, resubmitReason: 'Fixed the end time' };
    expect(updateProblems(again)).toEqual([]);
    expect(payloadOfUpdate(again)).toMatchObject({ resubmitReason: 'Fixed the end time', expectedVersion: 3, chapters: ['Tenses', 'Nouns'], portionsCompleted: 'Chapter 3', homework: 'Worksheet 4', classNotes: 'None' });
    expect(payloadOfUpdate(good)).not.toHaveProperty('resubmitReason');
    expect(payloadOfUpdate(good)).not.toHaveProperty('expectedVersion');
    expect(payloadOfUpdate({ ...again, conducted: 'no', notConductedReason: 'Ill' })).toEqual({ conducted: false, notConductedReason: 'Ill', voiceSent: false, resubmitReason: 'Fixed the end time', expectedVersion: 3 });
  });

  it('shows the new fields in the tutor form and the review, in the words of the requirement', () => {
    const form = read('../tutor-portal/TutorClasses.tsx');
    for (const label of ['Chapters covered, one to a line', 'Portions completed', 'Homework or assignments given', 'Additional remarks', 'What did you change?']) expect(form).toContain(label);
    const review = read('students/[id]/DailyClassesPanel.tsx');
    for (const label of ['Portions completed', 'Homework or assignments', 'Additional remarks', 'Update version']) expect(review).toContain(label);
  });
});

describe('Stage 1: update history', () => {
  const versions = [
    { version: 1, at: '2026-11-09T10:00:00Z', by: 'Meera Thomas', resubmission: false, reason: null, snapshot: { actualEndMinute: 970, homework: 'Worksheet 4', chapters: ['Tenses'], conducted: true }, changed: [] },
    { version: 2, at: '2026-11-09T12:00:00Z', by: 'Meera Thomas', resubmission: true, reason: 'The end time was 16:20', snapshot: { actualEndMinute: 980, homework: 'Worksheet 4', chapters: ['Tenses'], conducted: true }, changed: ['actualEndMinute'] },
  ];
  const html = (v: VersionInfo[]) => renderToStaticMarkup(React.createElement(VersionHistory, { versions: v }));

  it('lists every version oldest first with who sent it, why, and what changed, and how it was sent', () => {
    const out = html(versions);
    expect(out).toContain('Version 1, first submission');
    expect(out).toContain('Version 2, sent again');
    expect(out.indexOf('Version 1')).toBeLessThan(out.indexOf('Version 2'));
    expect(out).toContain('Meera Thomas');
    expect(out).toContain('Reason: The end time was 16:20');
    expect(out).toContain('Changed: Actual end.');
    expect(out).toContain('How it was sent');
    expect(out).toContain('Worksheet 4');
    expect(out).toContain('Tenses');
  });

  it('has no controls to change a version, and shows nothing when there is none', () => {
    expect(html(versions)).not.toMatch(/<(button|input|textarea)/);
    expect(html([])).toBe('');
  });
});

describe('Stage 1: activities with grade, level and option groups', () => {
  const base = { ...emptyActivity('g-8'), title: 'Fractions', topic: 'Fractions', instructions: 'Do page 4', learningLevel: 'ON_GRADE' };

  it('asks why when the grade is not the student own grade, and asks for the group and the label together', () => {
    expect(activityProblems(base, { studentGradeId: 'g-8' })).toEqual([]);
    expect(activityProblems({ ...base, gradeId: 'g-7' }, { studentGradeId: 'g-8' })).toEqual(['why this grade suits the student']);
    expect(activityProblems({ ...base, gradeId: 'g-7', suitabilityNote: 'Revision' }, { studentGradeId: 'g-8' })).toEqual([]);
    expect(activityProblems({ ...base, optionGroupKey: 'Practice' })).toEqual(['both the option group and the option label']);
    expect(activityProblems({ ...base, optionLabel: 'Easy' })).toEqual(['both the option group and the option label']);
    expect(activityProblems({ ...base, optionGroupKey: 'Practice', optionLabel: 'Easy' })).toEqual([]);
  });

  it('lets an older activity be edited without topic, grade and level, and sends the new fields only when they are set', () => {
    const old = { ...emptyActivity(), title: 'Old', instructions: 'Old text' };
    expect(activityProblems(old, { legacy: true })).toEqual([]);
    expect(activityProblems(old)).toEqual(['the topic', 'the grade it suits', 'the learning level']);
    expect(payloadOfActivity(old)).toEqual({ title: 'Old', type: 'WORKSHEET', topic: '', instructions: 'Old text' });
    expect(payloadOfActivity({ ...base, gradeId: 'g-7', suitabilityNote: 'Revision', optionGroupKey: ' Practice ', optionLabel: ' Easy ' })).toMatchObject({ gradeId: 'g-7', learningLevel: 'ON_GRADE', suitabilityNote: 'Revision', optionGroupKey: 'Practice', optionLabel: 'Easy' });
    expect(draftOfActivity({ id: 'a', position: 1, title: 'T', type: 'QUIZ', typeLabel: 'Quiz', typeDescription: null, topic: 'X', instructions: 'Y', dueDate: null, sharedAt: null, sharedBy: null, studentResponse: null, respondedAt: null, completion: 'PENDING', completionLabel: 'Not yet done', tutorRemarks: null, mentorRemarks: null, gradeId: 'g-8', learningLevel: 'ABOVE_GRADE', optionGroupKey: 'G', optionLabel: 'One' })).toMatchObject({ gradeId: 'g-8', learningLevel: 'ABOVE_GRADE', optionGroupKey: 'G', optionLabel: 'One', suitabilityNote: '' });
  });

  it('starts a new activity on the student own grade, and offers the levels the API accepts', () => {
    expect(emptyActivity('g-8').gradeId).toBe('g-8');
    expect(emptyActivity().gradeId).toBe('');
    const api = readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/class-workspace.ts'), 'utf8');
    expect(api).toContain("LEARNING_LEVELS = ['BELOW_GRADE', 'ON_GRADE', 'ABOVE_GRADE']");
    const drawer = read('ClassWorkspaceDrawer.tsx');
    expect(drawer).toContain('Learning level');
    expect(drawer).toContain('Grade it suits');
    expect(drawer).toContain('Option group, if this is one of several options');
    expect(drawer).toContain('All the options in a group count as one activity.');
  });
});

describe('Stage 1: follow-up tasks', () => {
  const item = (over: Partial<FollowUpInfo> = {}): FollowUpInfo => ({ id: 'task-1', title: 'Practise fractions', description: 'Ten questions', priority: 'HIGH', status: 'OPEN', dueAt: '2026-11-12T23:59:00Z', overdue: false, assignee: 'Meera Thomas', assigneeRole: 'TUTOR', assignedBy: 'Mira Staff', note: null, returnReason: null, createdAt: '2026-11-09T10:00:00Z', ...over });
  const html = (role: 'MENTOR' | 'TUTOR', items: FollowUpInfo[], canWork = true) => renderToStaticMarkup(React.createElement(FollowUps, { role, classKey: KEY, items, busy: false, canWork, run: jest.fn() }));

  it('lets the Mentor add a follow-up, and lists them with who does it, when it is due and what state it is in', () => {
    const out = html('MENTOR', [item()]);
    expect(out).toContain('Follow-up tasks');
    expect(out).toContain('Practise fractions');
    expect(out).toContain('For the tutor, Meera Thomas.');
    expect(out).toContain('Priority high.');
    expect(out).toContain('Add follow-up');
    expect(out).toContain('data-testid="follow-up-form"');
  });

  it('shows the Mentor the verify, send back and cancel buttons, with the reason box', () => {
    const out = html('MENTOR', [item({ status: 'SUBMITTED', note: 'Did all ten' })]);
    for (const label of ['Verify', 'Send back', 'Cancel it', 'Reason, needed to send back or cancel']) expect(out).toContain(label);
    expect(out).toContain('Handed in: Did all ten');
    expect(html('MENTOR', [item({ status: 'VERIFIED' })])).not.toContain('Send back');
    expect(html('MENTOR', [item()], false)).not.toContain('Add follow-up');
    expect(html('MENTOR', [item()], false)).not.toContain('Verify');
  });

  it('marks one past its due time as overdue, and says when it was sent back', () => {
    expect(html('MENTOR', [item({ overdue: true })])).toContain('Open, overdue');
    expect(html('MENTOR', [item({ status: 'RETURNED', returnReason: 'Show the working' })])).toContain('Sent back: Show the working');
  });

  it('shows the tutor only what was given to them, with the way to start it and hand it in, and no Mentor controls', () => {
    const out = html('TUTOR', [item()]);
    expect(out).toContain('I have started');
    expect(out).toContain('Hand it in');
    expect(out).toContain('What was done');
    for (const forbidden of ['Add follow-up', 'Verify', 'Send back', 'Cancel it']) expect(out).not.toContain(forbidden);
    expect(html('TUTOR', [])).toBe('');
    expect(html('TUTOR', [item({ status: 'SUBMITTED' })])).not.toContain('Hand it in');
  });

  it('checks the form before it asks the server', () => {
    const today = '2026-11-10';
    expect(followUpProblems(emptyFollowUp(), today)).toEqual(['a title', 'a due date']);
    expect(followUpProblems({ ...emptyFollowUp(), title: 'x', dueDate: '2026-11-09' }, today)).toEqual(['a due date that is not in the past']);
    expect(followUpProblems({ ...emptyFollowUp(), title: 'x', dueDate: today }, today)).toEqual([]);
    expect(payloadOfFollowUp({ ...emptyFollowUp(), title: 'x', dueDate: today })).toEqual({ title: 'x', description: '', assignee: 'TUTOR', priority: 'MEDIUM', dueDate: today });
  });

  it('is reached through the tutor bridge for the tutor only, and the Mentor routes need no bridge change', async () => {
    const mocked = fetchApi as jest.Mock;
    mocked.mockReset().mockResolvedValue({ ok: true });
    await expect(tutorPortalApiAction('/tutor-portal/class-workspace/follow-ups/abcdef12345', 'PUT')).resolves.toMatchObject({ ok: true });
    await expect(tutorPortalApiAction('/tutor-portal/class-workspace/follow-ups/abcdef12345', 'POST')).resolves.toMatchObject({ ok: false });
    await expect(tutorPortalApiAction('/tutor-portal/class-workspace/follow-ups/abcdef12345/extra', 'PUT')).resolves.toMatchObject({ ok: false });
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it('is shown on the Mentor review tab and in the tutor after-class tab', () => {
    const drawer = read('ClassWorkspaceDrawer.tsx');
    expect(drawer).toContain('<FollowUps role="MENTOR"');
    expect(drawer).toContain('<FollowUps role="TUTOR"');
    expect(drawer).toContain('<VersionHistory');
    expect(drawer).toContain('<StatusStrip');
  });
});
