import { allocationPreview, studentHoursText } from './capacity-view';
import { pendingLinks } from './student-hub-view';
import { SectionView, resetNotice, resetSections } from './section-verification-view';

describe('student hours are never a quiet zero', () => {
  it('says hours are not set when they are missing or zero', () => {
    expect(studentHoursText(null)).toBe('Hours not set');
    expect(studentHoursText(0)).toBe('Hours not set');
    expect(studentHoursText(undefined)).toBe('Hours not set');
    expect(studentHoursText(30)).toBe('30 h a month');
  });
});

describe('what an assignment does to a Mentor, said before it is confirmed', () => {
  const m = { name: 'Maya', allocatedHours: 60, monthlyHourLimit: 60 };
  it('warns when the student would take the Mentor over the limit and says an approval reason is needed', () => {
    const p = allocationPreview(m, 30);
    expect(p.tone).toBe('over');
    expect(p.text).toContain('0 h left');
    expect(p.text).toContain('30 h over');
    expect(p.text).toContain('asked for a reason');
  });
  it('shows the hours left after a fit', () => {
    expect(allocationPreview({ name: 'Nikhil', allocatedHours: 35, monthlyHourLimit: 100 }, 30)).toEqual({ tone: 'ok', text: 'Nikhil has 65 h left, 35 h after this student.' });
  });
  it('flags missing student hours instead of counting them as nothing', () => {
    expect(allocationPreview(m, null).tone).toBe('warn');
    expect(allocationPreview(m, 0).text).toContain('not set');
  });
});

describe('each pending item opens the place where it is dealt with', () => {
  it('links verification to the class list, complaints to the student tab and tasks to the checklist', () => {
    const links = pendingLinks({ activationId: 'a1', name: 'Asha Menon', pending: { verification: 2, complaints: 1, tasks: 3 } });
    expect(links.map((l) => l.label)).toEqual(['2 to verify', '1 complaint', '3 tasks']);
    expect(links[0].href).toBe('/mentoring/classes?card=classes_awaiting_verification&studentQuery=Asha%20Menon');
    expect(links[1].href).toBe('/mentoring/students/a1?tab=complaints');
    expect(links[2].href).toBe('/mentoring/students/a1?panel=checklist');
  });
  it('has no links when nothing is pending', () => {
    expect(pendingLinks({ activationId: 'a1', name: 'X', pending: { verification: 0, complaints: 0, tasks: 0 } })).toEqual([]);
  });
});

describe('an edit that resets a verified section says so', () => {
  const sec = (sectionId: string, status: string): SectionView => ({ sectionId, label: sectionId, status, verifiedByName: null, verifiedAt: null } as unknown as SectionView);
  it('finds only the sections that went from Verified to Not verified', () => {
    const reset = resetSections([sec('parent', 'VERIFIED'), sec('student', 'VERIFIED'), sec('x', 'NOT_VERIFIED')], [sec('parent', 'NOT_VERIFIED'), sec('student', 'VERIFIED'), sec('x', 'NOT_VERIFIED')]);
    expect(reset.map((s) => s.sectionId)).toEqual(['parent']);
    expect(resetNotice(reset[0])).toContain('now Not verified, because its information changed');
  });
});
