import { averagePercentage, compareRows, isOverdueMeeting, listState, sortRank } from './review-list';

describe('the Meetings list rules', () => {
  it('shows a student with no meeting as not scheduled, and otherwise the meeting state', () => {
    expect(listState(null)).toBe('NOT_SCHEDULED');
    expect(listState({ status: 'SCHEDULED', date: '2026-11-20', originalDate: '2026-11-20', conducted: null })).toBe('SCHEDULED');
    expect(listState({ status: 'SCHEDULED', date: '2026-11-25', originalDate: '2026-11-20', conducted: null })).toBe('RESCHEDULED');
    expect(listState({ status: 'SCHEDULED', date: '2026-11-20', originalDate: '2026-11-20', conducted: true })).toBe('REVIEW_IN_PROGRESS');
    expect(listState({ status: 'COMPLETED', date: '2026-11-20', originalDate: '2026-11-20', conducted: true })).toBe('COMPLETED');
  });

  it('calls a meeting overdue only when it is still to be held after its date, or was not held', () => {
    expect(isOverdueMeeting('SCHEDULED', '2026-11-10', '2026-11-12')).toBe(true);
    expect(isOverdueMeeting('RESCHEDULED', '2026-11-12', '2026-11-12')).toBe(false);
    expect(isOverdueMeeting('NOT_CONDUCTED', '2026-11-10', '2026-11-12')).toBe(true);
    expect(isOverdueMeeting('COMPLETED', '2026-10-01', '2026-11-12')).toBe(false);
    expect(isOverdueMeeting('NOT_SCHEDULED', null, '2026-11-12')).toBe(false);
    expect(isOverdueMeeting('REVIEW_IN_PROGRESS', '2026-11-01', '2026-11-12')).toBe(false);
  });

  it('puts what waits on the Mentor first and history last, newest first', () => {
    const rows = [
      { rank: sortRank('COMPLETED', false), date: '2026-10-05', studentName: 'A' },
      { rank: sortRank('COMPLETED', false), date: '2026-10-20', studentName: 'B' },
      { rank: sortRank('SCHEDULED', false), date: '2026-11-20', studentName: 'C' },
      { rank: sortRank('NOT_SCHEDULED', false), date: null, studentName: 'D' },
      { rank: sortRank('SCHEDULED', true), date: '2026-11-01', studentName: 'E' },
      { rank: sortRank('REVIEW_IN_PROGRESS', false), date: '2026-11-10', studentName: 'F' },
    ];
    expect([...rows].sort(compareRows).map((r) => r.studentName)).toEqual(['E', 'D', 'F', 'C', 'B', 'A']);
  });

  it('averages only exams that have marks, and says nothing when there are none', () => {
    expect(averagePercentage([80, null, 60])).toBe(70);
    expect(averagePercentage([null])).toBeNull();
    expect(averagePercentage([])).toBeNull();
  });
});
