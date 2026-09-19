"use client";
import * as React from 'react';
import { getRoundRobinStateAction, updateRoundRobinStateAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function RoundRobinPage() {
  const [state, setState] = React.useState<any>(null);
  const { hasPermission } = usePermissions();

  const load = async () => {
    const res = await getRoundRobinStateAction();
    setState(res);
  };
  React.useEffect(() => { load(); }, []);

  if (!state) return null;

  // Compute Queue
  const eligible = state.counsellors.filter((c: any) => c.isEligible && c.dailyState === 'ACTIVE' && c.user.status === 'ACTIVE');
  // Sort primarily by userId
  eligible.sort((a: any, b: any) => a.userId.localeCompare(b.userId));

  let nextUser = null;
  
  const returning = eligible.filter((c: any) => c.lastReturnedAt !== null);
  if (returning.length > 0) {
    returning.sort((a: any, b: any) => new Date(a.lastReturnedAt).getTime() - new Date(b.lastReturnedAt).getTime());
    nextUser = returning[0];
  } else if (eligible.length > 0) {
    const idx = eligible.findIndex((c: any) => c.userId > (state.lastAssignedUserId || ''));
    if (idx !== -1) nextUser = eligible[idx];
    else nextUser = eligible[0];
  }

  const getUserDisplayName = (u: any) => {
    if (u?.employee?.firstName) {
      return `${u.employee.firstName} ${u.employee.lastName} (${u.userRoles?.[0]?.role?.name || 'Sales Staff'})`;
    }
    return u?.email || 'Unknown';
  };

  const lastAssigned = state.counsellors.find((c: any) => c.userId === state.lastAssignedUserId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Round Robin Configuration</h1>
          <p className="text-sm text-slate-500 mt-1">Manage lead distribution queue and pause state.</p>
        </div>
        {hasPermission('roundrobin.manage') && (
          <Button variant={state.isPaused ? 'primary' : 'danger'} onClick={async () => {
            await updateRoundRobinStateAction(!state.isPaused);
            load();
          }}>
            {state.isPaused ? 'Resume Round Robin' : 'Pause Round Robin'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Queue Status</h2>
          <div className="text-3xl font-bold mb-4">
            {state.isPaused ? <span className="text-rose-500">PAUSED</span> : <span className="text-emerald-500">ACTIVE</span>}
          </div>
          <div className="space-y-2 mt-6">
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-500">Last Assigned</span>
              <span className="font-medium">{lastAssigned ? getUserDisplayName(lastAssigned.user) : 'None'}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500">Next Up</span>
              <span className="font-medium text-brand-600">{nextUser ? getUserDisplayName(nextUser.user) : 'None (Empty pool)'}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">Eligible Queue ({eligible.length})</h2>
          <ul className="space-y-3">
            {eligible.map((c: any, i: number) => {
              const isNext = nextUser?.userId === c.userId;
              const isReturning = c.lastReturnedAt !== null;
              return (
                <li key={c.userId} className={`p-3 rounded-md border flex items-center justify-between ${isNext ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-500">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{getUserDisplayName(c.user)}</div>
                      <div className="text-xs text-slate-500">{c.user.email}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isNext && <Badge variant="info">Next</Badge>}
                    {isReturning && <Badge variant="warning">Returning Priority</Badge>}
                  </div>
                </li>
              );
            })}
            {eligible.length === 0 && (
              <div className="text-slate-500 italic text-center py-4">No eligible active counsellors in queue.</div>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
