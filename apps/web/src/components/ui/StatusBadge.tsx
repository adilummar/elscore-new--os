import * as React from 'react';
import { Badge } from './Badge';
export function StatusBadge({ status }: { status: string }) { return <Badge variant="info">{status}</Badge>; }