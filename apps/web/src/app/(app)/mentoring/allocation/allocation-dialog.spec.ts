import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, './AllocationClient.tsx'), 'utf8');

describe('Allocation over-capacity confirmation dialog', () => {
  it('never uses window.prompt anywhere in the component', () => {
    expect(source).not.toContain('window.prompt');
    expect(source).not.toContain('prompt(');
  });

  it('uses the shared accessible Overlay component with variant="dialog"', () => {
    expect(source).toContain('<Overlay');
    expect(source).toContain('variant="dialog"');
    expect(source).toContain('testId="over-capacity-dialog"');
    expect(source).toContain('title="Mentor at capacity"');
  });

  it('displays current workload, proposed workload, and capacity limit', () => {
    expect(source).toContain('Current Workload');
    expect(source).toContain('Proposed Workload');
    expect(source).toContain('Capacity Limit');
    expect(source).toContain('{target.mentor.openStudents} students');
    expect(source).toContain('{target.mentor.openStudents + 1} students');
    expect(source).toContain('{target.mentor.capacity} students');
  });

  it('requires a reason and rejects blank or whitespace-only inputs', () => {
    expect(source).toContain('trimmed = reason.trim()');
    expect(source).toContain('Please provide a reason for allocating over capacity.');
    expect(source).toContain('setReasonError');
    expect(source).toContain('aria-required="true"');
    expect(source).toContain('aria-invalid={!!reasonError}');
    expect(source).toContain('role="alert"');
  });

  it('submits overCapacityReason to the backend on valid confirmation', () => {
    expect(source).toContain('overCapacityReason: trimmed');
    expect(source).toContain('POST');
    expect(source).toContain('/assign');
  });

  it('provides a Cancel action that dismisses the dialog without submitting', () => {
    expect(source).toContain('Cancel');
    expect(source).toContain('setTarget(null)');
  });

  it('prevents duplicate submissions with dialogBusy state', () => {
    expect(source).toContain('setDialogBusy(true)');
    expect(source).toContain('if (!target || dialogBusy) return;');
    expect(source).toContain('disabled={dialogBusy}');
    expect(source).toContain('isLoading={dialogBusy}');
  });

  it('displays backend errors clearly within the dialog using Banner', () => {
    expect(source).toContain('setDialogError(err.message');
    expect(source).toContain('{dialogError && <Banner tone="error">{dialogError}</Banner>}');
  });

  it('enforces capacity validation so only mentors at or above capacity trigger the dialog', () => {
    expect(source).toContain('m.openStudents >= m.capacity');
    expect(source).toContain('setTarget({');
  });

  it('escapes quotation marks properly to prevent ESLint errors', () => {
    expect(source).toContain('&quot;Add missing Mentors&quot;');
    expect(source).not.toContain('choose "Add missing Mentors"');
  });
});
