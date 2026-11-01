export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export const ACTIVATION_LABELS: Record<string, string> = {
  AWAITING_ALLOCATION: 'Awaiting allocation',
  ACTIVATION_IN_PROGRESS: 'Activation in progress',
  ACTIVATION_ON_HOLD: 'On hold',
  ACTIVATION_BLOCKED: 'Blocked',
  PENDING_FINAL_APPROVAL: 'Pending final approval',
  ACTIVATED: 'Activated',
  CANCELLED: 'Cancelled',
};

export const STAGE_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  BLOCKED: 'Blocked',
  PENDING_REVIEW: 'Pending review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const ITEM_STATE_LABELS: Record<string, string> = {
  PENDING_COLLECTION: 'Pending collection',
  COLLECTED: 'Collected (needs Mentor verification)',
  VERIFIED: 'Verified',
  UNAVAILABLE: 'Unavailable',
  NOT_APPLICABLE: 'Not applicable',
};

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'ACTIVATED':
    case 'COMPLETED':
    case 'VERIFIED':
      return 'success';
    case 'ACTIVATION_ON_HOLD':
    case 'ON_HOLD':
    case 'PENDING_REVIEW':
    case 'PENDING_FINAL_APPROVAL':
    case 'COLLECTED':
    case 'SUBMITTED':
    case 'AWAITING_ALLOCATION':
      return 'warning';
    case 'ACTIVATION_BLOCKED':
    case 'BLOCKED':
    case 'CANCELLED':
    case 'RETURNED':
      return 'danger';
    case 'ACTIVATION_IN_PROGRESS':
    case 'IN_PROGRESS':
      return 'info';
    default:
      return 'default';
  }
}

export function pretty(value: string | null | undefined): string {
  if (!value) return '';
  return ACTIVATION_LABELS[value] ?? STAGE_LABELS[value] ?? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function fmt(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
