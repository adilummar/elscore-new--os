'use client';

import * as React from 'react';
import { getFollowUps } from '../actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { usePermissions } from '@/components/providers/AuthProvider';
import { CompleteFollowUpModal } from './CompleteFollowUpModal';
import { RescheduleModal } from './RescheduleModal';
import Link from 'next/link';

interface FollowUpListProps {
  view: 'today' | 'upcoming' | 'overdue' | 'all';
  onChange: () => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

export function FollowUpList({ view, onChange }: FollowUpListProps) {
  const [data, setData] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  
  const [completeFup, setCompleteFup] = React.useState<any | null>(null);
  const [rescheduleFup, setRescheduleFup] = React.useState<any | null>(null);

  const { hasPermission } = usePermissions();

  const loadFollowUps = React.useCallback(async (cursor?: string) => {
    try {
      if (!cursor) setIsLoading(true);
      setError('');
      
      const res = await getFollowUps({ view, cursor, limit: 20 });
      if (cursor) {
        setData(prev => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      setNextCursor(res.pagination.nextCursor);
    } catch (e: any) {
      setError(e.message || 'Failed to load follow-ups');
    } finally {
      setIsLoading(false);
    }
  }, [view]);

  React.useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  if (isLoading && data.length === 0) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (error && data.length === 0) {
    return <ErrorState title="Error" description={error} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState 
        title="No Follow-ups"
        description={`There are no follow-ups for the "${view}" view.`} 
      />
    );
  }

  return (
    <div>
      <div className="divide-y divide-slate-100">
        {data.map((fup) => (
          <div key={fup.id} className="p-4 sm:p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Link href={`/leads/${fup.leadId}`} className="text-sm font-semibold text-brand-700 hover:underline truncate">
                  {fup.lead?.firstName} {fup.lead?.lastName}
                </Link>
                {fup.status === 'OVERDUE' && (
                  <Badge variant="danger" className="text-[10px] px-1.5 py-0">OVERDUE</Badge>
                )}
                {fup.status === 'COMPLETED' && (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">COMPLETED</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="font-medium text-slate-700">
                  {formatDate(fup.scheduledAt)}
                </span>
                <span>•</span>
                <span>Phone: {fup.lead?.primaryPhone}</span>
                <span>•</span>
                <span>Lead Status: <Badge variant="default" className="text-[10px]">{fup.lead?.status}</Badge></span>
                {fup.classification && (
                  <>
                    <span>•</span>
                    <span>Result: {fup.classification}</span>
                  </>
                )}
              </div>
              {fup.remarks && (
                <p className="mt-2 text-sm text-slate-600 line-clamp-2">{fup.remarks}</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {fup.status !== 'COMPLETED' && hasPermission('followup.complete') && (
                <Button size="sm" onClick={() => setCompleteFup(fup)}>Complete</Button>
              )}
              {fup.status !== 'COMPLETED' && hasPermission('followup.reschedule') && (
                <Button size="sm" variant="outline" onClick={() => setRescheduleFup(fup)}>Reschedule</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {nextCursor && (
        <div className="p-4 border-t border-slate-100 text-center bg-slate-50">
          <Button variant="ghost" onClick={() => loadFollowUps(nextCursor)} isLoading={isLoading}>
            Load More
          </Button>
        </div>
      )}

      {completeFup && (
        <CompleteFollowUpModal
          isOpen={true}
          onClose={() => setCompleteFup(null)}
          followUp={completeFup}
          onSuccess={() => {
            setCompleteFup(null);
            loadFollowUps();
            onChange();
          }}
        />
      )}

      {rescheduleFup && (
        <RescheduleModal
          isOpen={true}
          onClose={() => setRescheduleFup(null)}
          followUp={rescheduleFup}
          onSuccess={() => {
            setRescheduleFup(null);
            loadFollowUps();
            onChange();
          }}
        />
      )}
    </div>
  );
}
