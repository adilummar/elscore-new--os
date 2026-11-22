import { DECISIONS, SLA_LABEL, STAGES, fmtDateTime, fromLocalInput, labelOf, toLocalInput } from './constants';

describe('hiring constants', () => {
  it('lists the four stages in order and the five decisions', () => {
    expect(STAGES.map((s) => s.value)).toEqual(['LEAD', 'DETAILS_SHARED', 'CV', 'LIVE_DEMO_INTERVIEW']);
    expect(DECISIONS.map((d) => d.value)).toEqual(['ACCEPTED', 'HIRED', 'REJECTED', 'NOT_INTERESTED', 'NO_RESPONSE']);
  });
  it('labels values and falls back safely', () => {
    expect(labelOf(STAGES, 'LIVE_DEMO_INTERVIEW')).toBe('Live Demo & Interview');
    expect(labelOf(STAGES, null)).toBe('—');
  });
  it('round-trips a local datetime-local value', () => {
    const iso = '2026-11-16T09:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
  it('formats missing and invalid dates as a dash', () => {
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime('nope')).toBe('—');
  });
  it('has a label for every SLA state, including not-configured', () => {
    for (const s of ['PENDING', 'OVERDUE', 'COMPLETED', 'SLA_NOT_CONFIGURED', 'NOT_APPLICABLE']) expect(SLA_LABEL[s]).toBeDefined();
  });
});
