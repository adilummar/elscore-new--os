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

/** History entry types, in the words a business user would use. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  HANDOVER_COMPLETED: 'Handed over from Sales',
  ALLOCATION_QUEUED: 'Waiting for a Mentor',
  MENTOR_ALLOCATED: 'Mentor allocated',
  MENTOR_REASSIGNED: 'Mentor reassigned',
  RETURNED_TO_QUEUE: 'Returned to the allocation queue',
  STAGE_STARTED: 'Stage started',
  STAGE_VERIFIED: 'Stage verified',
  CHECKLIST_UPDATED: 'Checklist updated',
  INFO_COLLECTED: 'Information collected',
  EXCEPTION_AUTHORIZED: 'Exception authorised',
  WORKFLOW_PAUSED: 'Workflow paused',
  WORKFLOW_BLOCKED: 'Workflow blocked',
  WORKFLOW_RESUMED: 'Workflow resumed',
  SUBMITTED_FOR_APPROVAL: 'Submitted for final approval',
  APPROVAL_RETURNED: 'Returned to the Mentor',
  ACTIVATED: 'Activation approved',
  ACTIVATION_CANCELLED: 'Activation cancelled',
  TASK_ASSIGNED: 'Task assigned',
  TASK_STARTED: 'Task started',
  TASK_SUBMITTED: 'Task submitted',
  TASK_VERIFIED: 'Task verified',
  TASK_RETURNED: 'Task returned',
  TASK_PAUSED: 'Task paused',
  TASK_RESUMED: 'Task resumed',
  TASK_CANCELLED: 'Task cancelled',
  TASK_COMMENTED: 'Task comment added',
  HANDOVER_FIELD_UPDATED: 'Information updated',
  CHECKLIST_DEFINITION_MIGRATED: 'Checklist moved to the new format',
};

/** Reason codes the system writes itself (as opposed to reasons people type). */
export const REASON_LABELS: Record<string, string> = {
  MANUAL_MODE: 'Allocation is set to Manual',
  NO_ELIGIBLE_MENTOR: 'No eligible Mentor is available',
  NOT_AWAITING_ALLOCATION: 'Student is not waiting for allocation',
  LEAST_LOADED: 'Mentor with the lightest workload',
  SIBLING_AFFINITY: 'Same Mentor as a sibling',
};

export const PRIORITY_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };

/** What each permission code means to a person, used when a request is refused. */
export const PERMISSION_PHRASES: Record<string, string> = {
  'mentoring.stage.verify': 'verify stages',
  'mentoring.stage.work': 'work on stages',
  'mentoring.workflow.pause': 'pause or resume the workflow',
  'mentoring.approval.final': 'give final activation approval',
  'mentoring.allocation.manage': 'allocate students',
  'mentoring.allocation.configure': 'change allocation settings',
  'mentoring.allocation.read': 'view allocation',
  'mentoring.staff.manage': 'manage Mentors and Demo Counselors',
  'mentoring.staff.read': 'view Mentors and Demo Counselors',
  'mentoring.task.create': 'create tasks',
  'mentoring.task.work': 'work on tasks',
  'mentoring.task.verify': 'verify tasks',
  'mentoring.exception.authorize': 'authorise exceptions',
  'mentoring.activation.cancel': 'cancel activations',
  'mentoring.student.read-all': 'view all Mentoring students',
  'mentoring.student.read-assigned': 'view assigned Mentoring students',
  'mentoring.audit.read': 'view the Mentoring history',
  'mentoring.handover.retry': 'retry a Mentoring handover',
};

/** Rewrites "Access denied. Required permissions: a, b" in plain language; other messages stay as the API wrote them. */
export function friendlyMentoringError(message: string): string {
  const match = /^Access denied\. Required permissions?: (.+)$/i.exec(message.trim());
  if (!match) return message;
  const phrases = match[1].split(',').map((code) => code.trim()).filter(Boolean).map((code) => PERMISSION_PHRASES[code] ?? 'do this');
  return `You do not have permission to ${Array.from(new Set(phrases)).join(' or ')}.`;
}

export function pretty(value: string | null | undefined): string {
  if (!value) return '';
  return ACTIVATION_LABELS[value] ?? STAGE_LABELS[value] ?? EVENT_TYPE_LABELS[value] ?? REASON_LABELS[value] ?? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function fmt(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
