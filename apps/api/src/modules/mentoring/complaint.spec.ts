import {
  CATEGORY_LABELS, COMMUNICATION_LABELS, Entry, PRIORITY_LABELS, STAGE_LABELS, STATUSES, STATUS_LABELS, Status, checkAcknowledge, checkAssign, checkComplaint, checkReopen, checkResolution, checkStatus, checkText, parentHistory,
  reopenProblem, resolutionMinutes, stageOf,
} from './complaint';

const NOW = new Date('2026-11-10T08:00:00Z');
const good = { title: 'Late tutor', category: 'TUTOR', description: 'The tutor joined 20 minutes late twice.', parentName: 'Parent A', channel: 'PHONE' };

describe('logging a complaint for the parent', () => {
  it('needs a title, a category, what was said, who said it and how it reached the Mentor', () => {
    expect(checkComplaint(good, NOW)).toMatchObject({ ok: true, value: { title: 'Late tutor', category: 'TUTOR', priority: 'NORMAL', channel: 'PHONE', parentName: 'Parent A', receivedAt: NOW, subjectId: null, tutorUserId: null } });
    expect(checkComplaint({ ...good, title: ' ' }, NOW)).toMatchObject({ ok: false, message: 'Give the complaint a title.' });
    expect(checkComplaint({ ...good, category: 'WEATHER' }, NOW)).toMatchObject({ ok: false, message: expect.stringContaining('Choose a category') });
    expect(checkComplaint({ ...good, description: '' }, NOW)).toMatchObject({ ok: false, message: 'Write what the parent complained about.' });
    expect(checkComplaint({ ...good, parentName: ' ' }, NOW)).toMatchObject({ ok: false, message: expect.stringContaining('name of the parent') });
    expect(checkComplaint({ ...good, channel: 'FAX' }, NOW)).toMatchObject({ ok: false, message: expect.stringContaining('how the parent made the complaint') });
    expect(checkComplaint({ ...good, priority: 'SOON' }, NOW)).toMatchObject({ ok: false, message: expect.stringContaining('priority') });
    expect(checkComplaint(null, NOW)).toMatchObject({ ok: false });
  });

  it('has the five categories of the specification and a priority', () => {
    expect(Object.values(CATEGORY_LABELS)).toEqual(['Tutor', 'Timetable', 'Payment', 'Learning or academic progress', 'Other']);
    expect(checkComplaint({ ...good, priority: 'URGENT' }, NOW)).toMatchObject({ value: { priority: 'URGENT' } });
    expect(Object.values(PRIORITY_LABELS)).toEqual(['Low', 'Normal', 'High', 'Urgent']);
  });

  it('takes the time the parent complained, never in the future and never more than a month back', () => {
    expect(checkComplaint({ ...good, receivedAt: '2026-11-10T06:30:00Z' }, NOW)).toMatchObject({ ok: true, value: { receivedAt: new Date('2026-11-10T06:30:00Z') } });
    expect(checkComplaint({ ...good, receivedAt: '2026-11-10T09:00:00Z' }, NOW)).toMatchObject({ ok: false, message: expect.stringContaining('future') });
    expect(checkComplaint({ ...good, receivedAt: '2026-10-01T09:00:00Z' }, NOW)).toMatchObject({ ok: false, message: expect.stringContaining('30 days') });
    expect(checkComplaint({ ...good, receivedAt: 'yesterday' }, NOW)).toMatchObject({ ok: false, message: expect.stringContaining('real date and time') });
  });

  it('limits the length of every text', () => {
    expect(checkComplaint({ ...good, title: 'x'.repeat(201) }, NOW)).toMatchObject({ ok: false });
    expect(checkComplaint({ ...good, description: 'x'.repeat(4001) }, NOW)).toMatchObject({ ok: false });
    expect(checkComplaint({ ...good, supportingNote: 'x'.repeat(1001) }, NOW)).toMatchObject({ ok: false });
    expect(checkComplaint({ ...good, title: 5 }, NOW)).toMatchObject({ ok: false });
  });
});

describe('the stages the parent sees', () => {
  it('maps eight internal statuses to three stages: started, ongoing and resolved', () => {
    const expected: Record<Status, string> = { NEW: 'STARTED', ACKNOWLEDGED: 'STARTED', ASSIGNED: 'STARTED', IN_PROGRESS: 'ONGOING', WAITING_FOR_PARENT: 'ONGOING', WAITING_FOR_TUTOR: 'ONGOING', REOPENED: 'ONGOING', RESOLVED: 'RESOLVED' };
    for (const s of STATUSES) expect(stageOf(s)).toBe(expected[s]);
    expect(Object.values(STAGE_LABELS)).toEqual(['Started', 'Ongoing', 'Resolved']);
    expect(Object.values(STATUS_LABELS)).toEqual(['New', 'Acknowledged', 'Assigned', 'In progress', 'Waiting for parent', 'Waiting for tutor', 'Resolved', 'Reopened']);
  });
});

describe('acknowledging, writing and moving a complaint', () => {
  it('an acknowledgement says how the parent was told', () => {
    expect(checkAcknowledge({ channel: 'PHONE', note: 'Called at 10' })).toEqual({ ok: true, value: { channel: 'PHONE', note: 'Called at 10' } });
    expect(checkAcknowledge({ channel: 'SMOKE' })).toMatchObject({ ok: false, message: expect.stringContaining('how you told the parent') });
    expect(checkAcknowledge({ channel: 'EMAIL', note: 'x'.repeat(1001) })).toMatchObject({ ok: false });
  });

  it('a remark, an action or a response needs words', () => {
    expect(checkText({ text: ' Spoke to the tutor ' }, 'remark')).toEqual({ ok: true, value: 'Spoke to the tutor' });
    expect(checkText({ text: ' ' }, 'remark')).toMatchObject({ ok: false, message: 'Write the remark.' });
    expect(checkText({ text: 4 }, 'action taken')).toMatchObject({ ok: false, message: 'The action taken must be text.' });
    expect(checkText({ text: 'x'.repeat(4001) }, 'response')).toMatchObject({ ok: false });
  });

  it('an assignment names a person, and an escalation also needs a reason', () => {
    expect(checkAssign({ userId: 'u-head' })).toEqual({ ok: true, value: { userId: 'u-head', escalate: false, reason: null } });
    expect(checkAssign({ userId: 'u-head', escalate: true, reason: 'Needs the Head' })).toEqual({ ok: true, value: { userId: 'u-head', escalate: true, reason: 'Needs the Head' } });
    expect(checkAssign({ userId: 'u-head', escalate: true })).toMatchObject({ ok: false, message: 'Say why the complaint is being escalated.' });
    expect(checkAssign({})).toMatchObject({ ok: false, message: 'Choose the staff member.' });
  });

  it('only in progress and the two waiting statuses can be set by hand', () => {
    expect(checkStatus({ status: 'WAITING_FOR_PARENT', note: 'Asked for the receipt' })).toEqual({ ok: true, value: { status: 'WAITING_FOR_PARENT', note: 'Asked for the receipt' } });
    for (const status of ['NEW', 'RESOLVED', 'ASSIGNED', 'REOPENED', 'ACKNOWLEDGED', 'DONE']) expect(checkStatus({ status })).toMatchObject({ ok: false });
  });
});

describe('resolving a complaint', () => {
  const resolution = { remarks: 'The tutor was spoken to and the class time was fixed.', how: 'Class moved to a time the tutor can keep', communication: 'INFORMED' };
  const check = (over: object = {}, today = '2026-11-10', received = '2026-11-09') => checkResolution({ ...resolution, ...over }, today, received);

  it('needs resolution remarks, how the problem was resolved, and whether the parent was told', () => {
    expect(check()).toEqual({ ok: true, value: { remarks: resolution.remarks, how: resolution.how, resolutionDate: '2026-11-10', communication: 'INFORMED', communicationNote: null } });
    expect(check({ remarks: '' })).toMatchObject({ ok: false, message: expect.stringContaining('Explain how the complaint was resolved') });
    expect(check({ remarks: 'ok done' })).toMatchObject({ ok: false });
    expect(check({ how: ' ' })).toMatchObject({ ok: false, message: 'Say how the problem was resolved.' });
    expect(check({ communication: undefined })).toMatchObject({ ok: false, message: expect.stringContaining('whether the parent has been told') });
  });

  it('asks why when the parent has not been told, and accepts the reason', () => {
    expect(check({ communication: 'NOT_REACHABLE' })).toMatchObject({ ok: false, message: 'Say why the parent has not been told yet.' });
    expect(check({ communication: 'NOT_YET_INFORMED', communicationNote: 'Will call tomorrow' })).toMatchObject({ ok: true, value: { communication: 'NOT_YET_INFORMED', communicationNote: 'Will call tomorrow' } });
    expect(Object.values(COMMUNICATION_LABELS)).toHaveLength(3);
  });

  it('takes a real resolution date that is not in the future and not before the complaint', () => {
    expect(check({ resolutionDate: '2026-11-09' })).toMatchObject({ ok: true, value: { resolutionDate: '2026-11-09' } });
    expect(check({ resolutionDate: '2026-11-11' })).toMatchObject({ ok: false, message: expect.stringContaining('future') });
    expect(check({ resolutionDate: '2026-11-08' })).toMatchObject({ ok: false, message: expect.stringContaining('before the complaint') });
    expect(check({ resolutionDate: '2026-02-30' })).toMatchObject({ ok: false, message: expect.stringContaining('real resolution date') });
  });

  it('measures the time it took, from the complaint, and says nothing while it is open', () => {
    expect(resolutionMinutes(new Date('2026-11-10T04:00:00Z'), new Date('2026-11-10T07:30:00Z'))).toBe(210);
    expect(resolutionMinutes(new Date('2026-11-10T04:00:00Z'), null)).toBeNull();
  });
});

describe('reopening', () => {
  it('needs a reason, and is allowed for thirty days after the complaint was resolved', () => {
    expect(checkReopen({ reason: 'The problem came back' })).toEqual({ ok: true, value: 'The problem came back' });
    expect(checkReopen({ reason: ' ' })).toMatchObject({ ok: false, message: 'Say why the complaint is being reopened.' });
    expect(reopenProblem(new Date('2026-11-01T00:00:00Z'), NOW)).toBeNull();
    expect(reopenProblem(new Date('2026-10-01T00:00:00Z'), NOW)).toContain('Log a new complaint instead');
    expect(reopenProblem(null, NOW)).toBe('Only a resolved complaint can be reopened.');
  });
});

describe('what the parent is shown', () => {
  const entry = (kind: Entry['kind'], visibility: Entry['visibility'], at: string, text: string = kind): Entry => ({ kind, visibility, text, at, by: 'Mentor' });

  it('is only the entries meant for the parent, in the order they happened, never an internal remark', () => {
    const all = [entry('PARENT_RESPONSE', 'PARENT', '2026-11-10T09:00:00Z', 'We moved the class'), entry('INTERNAL_REMARK', 'INTERNAL', '2026-11-10T08:30:00Z', 'The tutor was rude'), entry('LOGGED', 'PARENT', '2026-11-10T08:00:00Z'), entry('ACTION_TAKEN', 'INTERNAL', '2026-11-10T08:45:00Z')];
    const shown = parentHistory(all);
    expect(shown.map((e) => e.kind)).toEqual(['LOGGED', 'PARENT_RESPONSE']);
    expect(JSON.stringify(shown)).not.toContain('rude');
  });
});

describe('the words', () => {
  it('has no dashes in the labels', () => {
    const all = [...Object.values(CATEGORY_LABELS), ...Object.values(STATUS_LABELS), ...Object.values(STAGE_LABELS), ...Object.values(COMMUNICATION_LABELS)].join(' ');
    expect(all).not.toMatch(/[–—]/);
  });
});
