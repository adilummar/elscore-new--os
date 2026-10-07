export type MissedCheckoutStatus = 'REQUIRED' | 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RESOLVED';

export function employeeMissedCheckoutPresentation(
  status: MissedCheckoutStatus,
  rejectionReason?: string | null,
) {
  if (status === 'REQUESTED') {
    return {
      pending: true,
      actionLabel: null,
      rejectionMessage: null,
    };
  }
  if (status === 'REJECTED') {
    return {
      pending: false,
      actionLabel: 'Request Approval Again',
      rejectionMessage: rejectionReason ? `Reason: ${rejectionReason}` : null,
    };
  }
  return {
    pending: false,
    actionLabel: 'Request Approval',
    rejectionMessage: null,
  };
}

export function validRejectionReason(reason: string): boolean {
  const length = reason.trim().length;
  return length > 0 && length <= 500;
}
