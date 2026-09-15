"use client";
import * as React from 'react';
import { getRoundRobinStateAction, updateRoundRobinStateAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Round Robin Configuration</h1>
        {hasPermission('roundrobin.manage') && (
          <Button variant={state.isPaused ? 'primary' : 'danger'} onClick={async () => {
            await updateRoundRobinStateAction(!state.isPaused);
            load();
          }}>
            {state.isPaused ? 'Resume Round Robin' : 'Pause Round Robin'}
          </Button>
        )}
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-2">Queue Status</h2>
        <div className="text-3xl font-bold mb-4">
          {state.isPaused ? <span className="text-red-500">PAUSED</span> : <span className="text-green-500">ACTIVE</span>}
        </div>
        <p className="text-gray-600">Last Assigned User ID: <span className="font-mono">{state.lastAssignedUserId || 'None'}</span></p>
      </Card>
      
      <h2 className="text-xl font-bold mt-8 mb-4">Eligible Pool</h2>
      <Card>
        <ul className="divide-y">
          {state.counsellors.filter((c: any) => c.isEligible && c.dailyState === 'ACTIVE').map((c: any) => (
            <li key={c.userId} className="p-4 flex justify-between">
              <span>{c.user.email}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
