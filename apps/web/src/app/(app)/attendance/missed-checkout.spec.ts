import {
  employeeMissedCheckoutPresentation,
  validRejectionReason,
} from './missed-checkout';

describe('missed checkout UI state', () => {
  it('shows a pending state without a duplicate request action', () => {
    expect(employeeMissedCheckoutPresentation('REQUESTED')).toEqual({
      pending: true,
      actionLabel: null,
      rejectionMessage: null,
    });
  });

  it('shows rejection reason and permits resubmission', () => {
    expect(employeeMissedCheckoutPresentation('REJECTED', 'Explain the missed checkout')).toEqual({
      pending: false,
      actionLabel: 'Request Approval Again',
      rejectionMessage: 'Reason: Explain the missed checkout',
    });
  });

  it('requires a trimmed rejection reason of at most 500 characters', () => {
    expect(validRejectionReason('   ')).toBe(false);
    expect(validRejectionReason('Reason')).toBe(true);
    expect(validRejectionReason('x'.repeat(501))).toBe(false);
  });
});
