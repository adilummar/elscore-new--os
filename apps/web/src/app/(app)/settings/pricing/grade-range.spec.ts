import {
  formatSlabGradeRange,
  gradeIdForSortOrder,
  slabSortOrdersForGrades,
  type GradeRef,
} from './grade-range';

const grades: GradeRef[] = [
  { id: 'kg', name: 'Kindergarten', sortOrder: 1 },
  { id: 'g1', name: 'Grade 1', sortOrder: 2 },
  { id: 'g4', name: 'Grade 4', sortOrder: 5 },
  { id: 'g5', name: 'Grade 5', sortOrder: 6 },
  { id: 'g6', name: 'Grade 6', sortOrder: 7 },
];

describe('pricing slab grade range', () => {
  it('persists Grade 1 to Grade 5 as sort orders 2 and 6', () => {
    expect(slabSortOrdersForGrades(grades, 'g1', 'g5')).toEqual({ gradeFrom: 2, gradeTo: 6 });
  });

  it('rejects Grade 5 to Grade 1', () => {
    expect(() => slabSortOrdersForGrades(grades, 'g5', 'g1')).toThrow(/before Grade To/);
  });

  it('maps a stored sort order back to the Grade record', () => {
    expect(gradeIdForSortOrder(grades, 2)).toBe('g1');
    expect(gradeIdForSortOrder(grades, 6)).toBe('g5');
  });

  it('displays grade names for a correctly stored Grade 1–5 slab', () => {
    expect(formatSlabGradeRange(grades, 2, 6)).toBe('Grade 1 to Grade 5');
  });
});
