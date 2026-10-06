import { deletionErrorView, studentsAfterDeletion } from './student-deletion';

describe('student deletion workspace behavior', () => {
  const leadStudents = [
    { id: 'student-1', firstName: 'Amina', requirements: [{ id: 'req-1' }] },
    { id: 'student-2', firstName: 'Omar', requirements: [{ id: 'req-2' }] },
  ];

  it('removes only the deleted student from the current list', () => {
    expect(studentsAfterDeletion(leadStudents, 'student-1')).toEqual([leadStudents[1]]);
  });

  it('shows the API conflict message and the actual blocker categories', () => {
    const view = deletionErrorView({
      name: 'Error',
      message: 'This Student cannot be deleted because they have existing demos and quotations. Historical business records must be preserved.',
      code: 'STUDENT_IN_USE',
      blockers: ['DEMO', 'QUOTATION'],
    });

    expect(view.message).toMatch(/existing demos and quotations/);
    expect(view.message).not.toMatch(/Something went wrong/);
    expect(view.blockers).toEqual(['Demos', 'Quotations']);
    expect(view.message).not.toMatch(/delete those|remove the demo|remove the quotation/i);
  });

  it('does not invent blockers for a different failure', () => {
    expect(deletionErrorView({ name: 'Error', message: 'Student not found' })).toEqual({
      message: 'Student not found',
      blockers: [],
    });
  });
});
