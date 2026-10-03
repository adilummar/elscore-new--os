export type GradeRef = {
  id: string;
  name: string;
  sortOrder: number;
};

export function slabSortOrdersForGrades(grades: GradeRef[], gradeFromId: string, gradeToId: string) {
  const gradeFrom = grades.find((grade) => grade.id === gradeFromId);
  const gradeTo = grades.find((grade) => grade.id === gradeToId);
  if (!gradeFrom || !gradeTo) {
    throw new Error('Select a Grade From and Grade To.');
  }
  if (gradeFrom.sortOrder > gradeTo.sortOrder) {
    throw new Error('Grade From must be the same as or before Grade To.');
  }
  return { gradeFrom: gradeFrom.sortOrder, gradeTo: gradeTo.sortOrder };
}

export function gradeIdForSortOrder(grades: GradeRef[], sortOrder: number) {
  return grades.find((grade) => grade.sortOrder === sortOrder)?.id ?? '';
}

export function formatSlabGradeRange(grades: GradeRef[], gradeFrom: number, gradeTo: number) {
  const fromName = grades.find((grade) => grade.sortOrder === gradeFrom)?.name;
  const toName = grades.find((grade) => grade.sortOrder === gradeTo)?.name;
  if (!fromName || !toName) {
    return `Unrecognized grade range (${gradeFrom}–${gradeTo})`;
  }
  return `${fromName} to ${toName}`;
}
