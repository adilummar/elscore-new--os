import {
  attentionTiles, actualDiffers, actualText, checklistCell, classHref, isOverdue, modeOf, needsAction, quickViewOf, reminderCell, scheduledText, shiftDay, updateCell, verificationCell, voiceCell, weekOf, workload,
} from './classes-view';

const base: any = {
  status: 'SCHEDULED', state: 'SCHEDULED', tutorConfirmation: 'NOT_SENT', mentorVerification: 'PENDING', update: null, documentation: undefined, returned: null, sla: null,
  startMinute: 960, endMinute: 1020, scheduledMinutes: 60, verified: null,
};
const row = (over: any = {}) => ({ ...base, ...over });

describe('Classes: dates', () => {
  it('moves a day across month ends', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('finds Monday to Sunday, also for a Sunday', () => {
    expect(weekOf('2026-11-12')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(weekOf('2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(weekOf('2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  });
  it('tells a day, a week and a range from a dashboard link apart', () => {
    expect(modeOf({ date: '2026-11-12', from: '', to: '' })).toBe('day');
    expect(modeOf({ date: '2026-11-12', from: '2026-11-09', to: '2026-11-15' })).toBe('week');
    expect(modeOf({ date: '2026-11-12', from: '2026-11-12', to: '2026-11-30' })).toBe('range');
  });
});

describe('Classes: a reminder that was only prepared is not a delivered one', () => {
  it('says Not sent until the API records it as sent', () => {
    expect(reminderCell(row()).text).toBe('Not sent');
    expect(reminderCell(row()).tone).toBe('waiting');
    expect(reminderCell(row({ tutorConfirmation: 'SENT' })).text).toBe('Sent, not acknowledged');
    expect(reminderCell(row({ tutorConfirmation: 'ACKNOWLEDGED' })).tone).toBe('done');
  });
  it('needs no reminder for a cancelled class', () => {
    expect(reminderCell(row({ state: 'CANCELLED', status: 'CANCELLED' })).tone).toBe('none');
  });
});

describe('Classes: the tutor update, voice and checklist cells', () => {
  it('does not treat a missing update as submitted', () => {
    expect(updateCell(row()).text).toBe('Not submitted');
    expect(updateCell(row({ update: { submittedAt: '2026-11-12T10:00:00Z', version: 1 } })).text).toBe('Submitted');
    expect(updateCell(row({ update: { submittedAt: '2026-11-12T10:00:00Z', version: 2 } })).text).toBe('Submitted again');
    expect(updateCell(row({ state: 'RETURNED_FOR_CORRECTION', update: { submittedAt: 'x' } })).tone).toBe('attention');
  });
  it('shows the voice as received only when the API says so', () => {
    expect(voiceCell(row({ update: { voice: { sentAt: '2026-11-12', receivedAt: null } } })).text).toBe('Sent, not confirmed');
    expect(voiceCell(row({ update: { voice: { sentAt: '2026-11-12', receivedAt: '2026-11-12' } } })).tone).toBe('done');
    expect(voiceCell(row({ update: { conducted: false, voice: {} } })).tone).toBe('none');
  });
  it('reads the checklist from the documentation status', () => {
    expect(checklistCell(row()).tone).toBe('none');
    expect(checklistCell(row({ documentation: { status: 'COMPLETE', label: 'Complete', missing: [] } })).tone).toBe('done');
    expect(checklistCell(row({ documentation: { status: 'IN_PROGRESS', label: 'In progress', missing: ['x'] } })).tone).toBe('waiting');
    expect(checklistCell(row({ documentation: { status: 'RETURNED', label: 'Returned', missing: [] } })).tone).toBe('attention');
  });
});

describe('Classes: verification and consumption stay the Mentor\'s', () => {
  it('marks a class waiting for the Mentor as needing attention, and shows verified as done', () => {
    expect(verificationCell(row({ state: 'AWAITING_MENTOR_VERIFICATION' })).tone).toBe('attention');
    expect(verificationCell(row({ mentorVerification: 'VERIFIED', state: 'VERIFIED' })).tone).toBe('done');
    expect(verificationCell(row()).text).toBe('Not verified');
  });
  it('counts only states that wait on a person as needing action', () => {
    expect(needsAction({ state: 'AWAITING_MENTOR_VERIFICATION' })).toBe(true);
    expect(needsAction({ state: 'SCHEDULED' })).toBe(false);
    expect(needsAction({ state: 'VERIFIED' })).toBe(false);
  });
});

describe('Classes: scheduled and actual time are kept apart', () => {
  it('shows the schedule always and the actual time only once reported', () => {
    expect(scheduledText(row())).toContain('1 h');
    expect(actualText(row())).toBeNull();
    const r = row({ update: { conducted: true, actualStartMinute: 965, actualEndMinute: 1030, actualMinutes: 65 } });
    expect(actualText(r)).toContain('1 h 5 min');
    expect(actualDiffers(r)).toBe(true);
    expect(actualDiffers(row({ update: { conducted: true, actualStartMinute: 960, actualEndMinute: 1020, actualMinutes: 60 } }))).toBe(false);
  });
  it('shows no actual time for a class that was not conducted', () => {
    expect(actualText(row({ update: { conducted: false, actualStartMinute: 960, actualEndMinute: 1020 } }))).toBeNull();
  });
});

describe('Classes: queues and counts', () => {
  it('names the queue that matches a card or a state', () => {
    expect(quickViewOf({ card: '', state: '' })).toBe('all');
    expect(quickViewOf({ card: 'classes_awaiting_verification', state: '' })).toBe('verify');
    expect(quickViewOf({ card: '', state: 'RETURNED_FOR_CORRECTION' })).toBe('returned');
    expect(quickViewOf({ card: '', state: 'VERIFIED' })).toBe('other');
  });
  it('builds the workload strip from the API counts and hides zeros', () => {
    expect(workload({ AWAITING_MENTOR_VERIFICATION: 3, VERIFIED: 0, SCHEDULED: 9 }, 12)).toEqual([{ state: 'AWAITING_MENTOR_VERIFICATION', label: 'to verify', count: 3 }]);
    expect(workload({ AWAITING_MENTOR_VERIFICATION: 3 }, 0)).toEqual([]);
  });
  it('flags only a breached response time as overdue', () => {
    expect(isOverdue({ sla: { state: 'BREACHED', label: '', dueAt: '', overdueMinutes: 5 } })).toBe(true);
    expect(isOverdue({ sla: { state: 'APPROACHING', label: '', dueAt: '', overdueMinutes: 0 } })).toBe(false);
    expect(isOverdue({ sla: null })).toBe(false);
  });
  it('makes a link that survives the key\'s separator', () => {
    expect(classHref('a~2026-11-12~960')).toBe('/mentoring/classes/a~2026-11-12~960');
  });

  it('builds the attention tiles from the API counts and the overdue verifications', () => {
    const t = attentionTiles({ AWAITING_MENTOR_VERIFICATION: 4, AWAITING_TUTOR_UPDATE: 2 }, 1);
    expect(t.map((x) => [x.key, x.count])).toEqual([['verify', 4], ['overdue', 1], ['update', 2], ['returned', 0]]);
    expect(t.every((x) => ['verify', 'update', 'returned'].includes(x.view))).toBe(true);
  });
});
