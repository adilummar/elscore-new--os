import { mergeLegacyExamRows, withLegacyRows, withLegacyValues } from './handover-legacy';

const row = (fieldKey: string, value: unknown, at = '2026-11-03T09:00:00Z') => ({ fieldKey, value, updatedAt: new Date(at) });

describe('information saved before fields were combined', () => {
  it('merges the two older examination lists into one row per subject', () => {
    expect(
      mergeLegacyExamRows(
        [{ subject: 'Maths', date: '2026-12-01' }, { subject: 'Science', date: '2026-12-05' }],
        [{ subject: 'maths', portions: 'Chapters 1 to 5' }, { subject: 'English', portions: 'Poems' }],
      ),
    ).toEqual([
      { subject: 'Maths', date: '2026-12-01', portions: 'Chapters 1 to 5' },
      { subject: 'Science', date: '2026-12-05', portions: '' },
      { subject: 'English', date: '', portions: 'Poems' },
    ]);
    expect(mergeLegacyExamRows(undefined, [])).toBeNull();
  });

  it('adds the combined table only while the new field has no row, and never changes the stored rows', () => {
    const stored = [row('examination.upcomingDates', [{ subject: 'Maths', date: '2026-12-01' }]), row('examination.syllabusPortions', [{ subject: 'Maths', portions: 'Ch 1' }], '2026-11-04T09:00:00Z')];
    const out = withLegacyRows(stored);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ fieldKey: 'examination.upcoming', value: [{ subject: 'Maths', date: '2026-12-01', portions: 'Ch 1' }] });
    expect(stored).toHaveLength(2);
    const saved = withLegacyRows([...stored, row('examination.upcoming', [{ subject: 'Maths', date: '2026-12-02', portions: 'Ch 2' }])]);
    expect(saved).toHaveLength(3); // the combined field now counts and nothing is derived
  });

  it('shows the second alternate number when the first is empty, and never when the first is saved', () => {
    expect(withLegacyRows([row('parent.altPhone2', '+971500000009')]).find((r) => r.fieldKey === 'parent.altPhone1')?.value).toBe('+971500000009');
    expect(withLegacyRows([row('parent.altPhone1', '+971500000001'), row('parent.altPhone2', '+971500000009')])).toHaveLength(2);
  });

  it('the same derivation applies to the value map the checklist and the section fingerprints read', () => {
    const values = withLegacyValues(new Map<string, unknown>([['examination.upcomingDates', [{ subject: 'Maths', date: '2026-12-01' }]], ['parent.altPhone2', '+97150']]));
    expect(values.get('examination.upcoming')).toEqual([{ subject: 'Maths', date: '2026-12-01', portions: '' }]);
    expect(values.get('parent.altPhone1')).toBe('+97150');
  });
});
