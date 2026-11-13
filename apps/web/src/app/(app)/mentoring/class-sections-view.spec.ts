import { SECTIONS, afterChecklist, beforeChecklist, reminderCheck, timingHistory, timingRows, tutorUpdateRows } from './class-sections-view';

const cls = (over: any = {}) => ({
  checklist: [], startMinute: 960, endMinute: 1020, scheduledMinutes: 60, update: null, ...over,
});
const after = (over: any = {}) => ({ messages: [], versions: [], ...over });

const share = (over: any = {}) => ({ id: 'sh-1', text: 'x', preparedBy: 'Mira', preparedAt: '2026-11-04T09:00:00Z', copiedAt: null, confirmedAt: null, confirmedBy: null, ...over });
const before = (shareValue: any, status = 'SCHEDULED') => ({ class: cls({ status }), before: { message: { share: shareValue } } }) as never;

describe('Class page: before-class reminder checkbox', () => {
  it('is pending, unticked and not tickable when nothing has been prepared', () => {
    expect(reminderCheck(before(null), true)).toMatchObject({ status: 'PENDING', label: 'Pending', done: false, canTick: false, shareId: null });
  });
  it('is "Prepared, not sent" and unticked when a message exists but nobody recorded it as shared', () => {
    expect(reminderCheck(before(share()), true)).toMatchObject({ status: 'PREPARED', label: 'Prepared, not sent', done: false, canTick: true, shareId: 'sh-1' });
    expect(reminderCheck(before(share()), true).detail).toBe('Prepared, not copied');
    expect(reminderCheck(before(share({ copiedAt: '2026-11-04T09:30:00Z' })), true).detail).toBe('Copied, not yet recorded as shared');
  });
  it('is ticked only when the share was confirmed, with who and when, and then cannot be ticked again', () => {
    const sent = reminderCheck(before(share({ copiedAt: 'x', confirmedAt: '2026-11-04T09:40:00Z', confirmedBy: 'Mira Mentor' })), true);
    expect(sent).toMatchObject({ status: 'SENT', label: 'Sent', done: true, canTick: false });
    expect(sent.detail).toBe('Recorded as shared by Mira Mentor on 2026-11-04 09:40 UTC');
  });
  it('stays unticked and not tickable for someone who may not act, whatever the state', () => {
    expect(reminderCheck(before(share()), false).canTick).toBe(false);
    expect(reminderCheck(before(share()), false).done).toBe(false);
  });
  it('is not needed for a cancelled class', () => {
    expect(reminderCheck(before(share(), 'CANCELLED'), true)).toMatchObject({ status: 'NOT_NEEDED', done: false, canTick: false });
  });
  it('never treats the system tutor reminder as the student reminder', () => {
    const w = { class: cls({ checklist: [{ key: 'REMINDER', done: true, detail: 'Sent and acknowledged by the tutor' }] }), before: { message: { share: null } } } as never;
    expect(reminderCheck(w, true).done).toBe(false);
    expect(beforeChecklist(w)[0].done).toBe(false);
  });
  it('words the single before-class row', () => {
    const rows = beforeChecklist(before(share()));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'Tutor has sent the class reminder to the student', done: false });
  });
});

describe('Class page: after-class checklist', () => {
  it('lists the checklist message, the voice recording and the activities, each done only when recorded', () => {
    const rows = afterChecklist({ class: cls(), after: after() } as never);
    expect(rows.map((r) => r.label)).toEqual(['After-class checklist shared', 'Voice recording shared', 'Activities given']);
    expect(rows.every((r) => !r.done)).toBe(true);
  });
  it('counts the checklist as shared only once someone confirmed it', () => {
    const msg = (share: any) => ({ key: 'POST_CLASS_ACTIVITIES', share });
    expect(afterChecklist({ class: cls(), after: after({ messages: [msg({ copiedAt: 'x', confirmedAt: null })] }) } as never)[0].done).toBe(false);
    expect(afterChecklist({ class: cls(), after: after({ messages: [msg({ copiedAt: 'x', confirmedAt: 'y' })] }) } as never)[0].done).toBe(true);
    const done = afterChecklist({ class: cls({ checklist: [{ key: 'VOICE', done: true, detail: 'Uploaded and shared' }, { key: 'ACTIVITIES', done: true, detail: '3 shared' }] }), after: after() } as never);
    expect(done[1].done && done[2].done).toBe(true);
  });
});

describe('Class page: what the tutor submitted', () => {
  it('shows nothing until the update is submitted', () => {
    expect(tutorUpdateRows({ class: cls() } as never)).toEqual([]);
    expect(tutorUpdateRows({ class: cls({ update: { submittedAt: null } }) } as never)).toEqual([]);
  });
  it('shows an empty field as empty and names every activity, including the free-text one', () => {
    const rows = tutorUpdateRows({ class: cls({ update: { submittedAt: 'x', conducted: true, topicsCovered: 'Tenses', activities: ['WORKSHEET', 'OTHER'], otherActivity: 'Role play', evaluationRemarks: '' } }) } as never);
    const by = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(by['Topics covered']).toBe('Tenses');
    expect(by['Class evaluation remarks']).toBe('Not written');
    expect(by['Activities given']).toBe('Worksheet, Other: Role play');
  });
  it('shows only the reason for a class that was not conducted', () => {
    const rows = tutorUpdateRows({ class: cls({ update: { submittedAt: 'x', conducted: false, notConductedReason: 'Student ill', activities: [] } }) } as never);
    expect(rows.map((r) => r.label)).toEqual(['Class conducted', 'Reason not conducted']);
  });
});

describe('Class page: scheduled and actual time', () => {
  it('keeps them apart and flags only a real difference', () => {
    const same = timingRows({ class: cls({ update: { conducted: true, actualStartMinute: 960, actualEndMinute: 1020, actualMinutes: 60 } }) } as never);
    expect(same.map((r) => r.label)).toEqual(['Scheduled', 'Actual start and end', 'Actual duration']);
    expect(same.some((r) => r.differs)).toBe(false);
    const moved = timingRows({ class: cls({ update: { conducted: true, actualStartMinute: 965, actualEndMinute: 1030, actualMinutes: 65 } }) } as never);
    expect(moved[1].differs).toBe(true);
    expect(moved[2].value).toBe('1 h 5 min');
    expect(moved[0].value).toContain('1 h');
  });
  it('says so when the tutor has not reported a time', () => {
    expect(timingRows({ class: cls() } as never)[1].value).toBe('Not reported by the tutor yet');
  });
  it('lists the submissions that changed the reported time', () => {
    const v = [{ version: 1, at: '2026-11-12T10:00:00Z', by: 'Meera', changed: [] }, { version: 2, at: '2026-11-12T11:00:00Z', by: 'Meera', changed: ['actualEndMinute'] }];
    expect(timingHistory({ after: after({ versions: v }) } as never)).toEqual([{ version: 2, at: '2026-11-12T11:00:00Z', by: 'Meera' }]);
  });
  it('has the four sections in order', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(['before', 'after', 'timing', 'verification']);
  });
});
