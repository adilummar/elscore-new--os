import * as React from 'react';
import { Badge, BadgeProps } from './Badge';

export function StatusBadge({ status }: { status: string }) {
  let variant: BadgeProps['variant'] = 'default';

  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'CONFIRMED':
    case 'OPEN':
    case 'FILLED':
    case 'ACCEPTED':
    case 'HIRED':
    case 'COMPLETED':
    case 'VERIFIED':
    case 'READY_FOR_FINALIZATION':
      variant = 'success';
      break;
    case 'PROBATION':
    case 'NOTICE_PERIOD':
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'ON_HOLD':
    case 'OFFERED':
    case 'IN_PROGRESS':
    case 'EXTENDED':
      variant = 'warning';
      break;
    case 'SUSPENDED':
    case 'TERMINATED':
    case 'REJECTED':
    case 'CANCELLED':
    case 'DECLINED':
    case 'WITHDRAWN':
    case 'EXPIRED':
    case 'NO_SHOW':
      variant = 'danger';
      break;
    case 'ON_LEAVE':
    case 'SENT':
    case 'INTERVIEWING':
      variant = 'info';
      break;
    case 'SCREENING':
    case 'APPLIED':
    case 'DRAFT':
    case 'WAIVED':
    default:
      variant = 'default';
      break;
  }

  return <Badge variant={variant}>{status}</Badge>;
}