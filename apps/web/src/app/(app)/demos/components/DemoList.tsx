'use client';

import * as React from 'react';
import Link from 'next/link';
import { getDemos } from '../actions';
import { usePermissions } from '@/components/providers/AuthProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { RescheduleDemoModal } from './RescheduleDemoModal';
import { CompleteDemoModal } from './CompleteDemoModal';
import { AssignTutorModal } from './AssignTutorModal';
import { CancelDemoModal } from './CancelDemoModal';
import { NoShowDemoModal } from './NoShowDemoModal';
import { EditDemoModal } from './EditDemoModal';

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { 
    month: 'short', day: 'numeric', year: 'numeric' 
  }).format(new Date(dateStr));
}

function formatTime(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { 
    hour: 'numeric', minute: '2-digit', hour12: true 
  }).format(new Date(dateStr));
}

export function DemoList({ view }: { view: 'today' | 'upcoming' | 'completed' | 'all' }) {
  const { hasPermission } = usePermissions();
  const [data, setData] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Modals state
  const [activeDemo, setActiveDemo] = React.useState<any>(null);
  const [modalState, setModalState] = React.useState<'none' | 'reschedule' | 'edit' | 'complete' | 'assign' | 'cancel' | 'noshow'>('none');

  const loadDemos = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDemos({ view });
      setData(res.data || res || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load demos');
    } finally {
      setIsLoading(false);
    }
  }, [view]);

  React.useEffect(() => {
    loadDemos();
  }, [loadDemos]);

  const handleActionSuccess = () => {
    setModalState('none');
    setActiveDemo(null);
    loadDemos();
  };

  if (isLoading && data.length === 0) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error && data.length === 0) {
    return <ErrorState title="Error" description={error} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState 
        title="No Demos Found"
        description={`There are no demos for the "${view}" view.`} 
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-medium">Student & Requirement</th>
              <th className="px-6 py-4 font-medium">Date & Time</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Tutor</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.map((demo) => {
              const studentName = demo.student ? `${demo.student.firstName} ${demo.student.lastName}` : 'Unknown Student';
              const subjectName = demo.subject?.name || 'Unknown Subject';
              const gradeName = demo.grade?.name || 'Unknown Grade';
              const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(demo.status);
              
              const actions = [];
              if (!isTerminal) {
                if (hasPermission('demo.reschedule') || true) {
                   actions.push({ label: 'Reschedule', onClick: () => { setActiveDemo(demo); setModalState('reschedule'); } });
                   actions.push({ label: 'Edit', onClick: () => { setActiveDemo(demo); setModalState('edit'); } });
                }
                if (hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || true) {
                   actions.push({ label: 'Cancel Demo', onClick: () => { setActiveDemo(demo); setModalState('cancel'); } });
                }
                if (demo.status === 'ASSIGNED') {
                  if (hasPermission('demo.complete')) {
                    actions.push({ label: 'Complete Demo', onClick: () => { setActiveDemo(demo); setModalState('complete'); } });
                  }
                  if (hasPermission('demo.mark_exceptions')) {
                    actions.push({ label: 'Mark No-Show', onClick: () => { setActiveDemo(demo); setModalState('noshow'); } });
                  }
                }
                if (hasPermission('demo.assign_tutor')) {
                  actions.push({ label: 'Assign Tutor', onClick: () => { setActiveDemo(demo); setModalState('assign'); } });
                }
              }

              actions.push({ label: 'View Details', href: `/demos/${demo.id}` });

              return (
                <tr key={demo.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/demos/${demo.id}`} className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
                      {studentName}
                    </Link>
                    <div className="text-slate-500 mt-0.5 text-xs">
                      {subjectName} • {gradeName}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-900">{formatDate(demo.scheduledAt)}</div>
                    <div className="text-slate-500 mt-0.5 text-xs">{formatTime(demo.scheduledAt)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={demo.status} />
                  </td>
                  <td className="px-6 py-4">
                    {demo.tutor ? (
                      <span className="text-slate-900">{demo.tutor.firstName} {demo.tutor.lastName}</span>
                    ) : (
                      <span className="text-slate-400 text-sm italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      {actions.map((action, i) => {
                        if (action.href) {
                          return <Link key={i} href={action.href} className="text-blue-600 hover:underline">{action.label}</Link>;
                        }
                        return <button key={i} onClick={action.onClick} className="text-blue-600 hover:underline">{action.label}</button>;
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeDemo && (
        <>
          <RescheduleDemoModal 
            isOpen={modalState === 'reschedule'} 
            onClose={() => setModalState('none')} 
            demo={activeDemo} 
            onSuccess={handleActionSuccess} 
          />
          <EditDemoModal
            isOpen={modalState === 'edit'}
            onClose={() => setModalState('none')}
            demo={activeDemo}
            lead={activeDemo.student?.lead}
            onSuccess={handleActionSuccess}
          />
          <CompleteDemoModal 
            isOpen={modalState === 'complete'} 
            onClose={() => setModalState('none')} 
            demo={activeDemo} 
            onSuccess={handleActionSuccess} 
          />
          <AssignTutorModal 
            isOpen={modalState === 'assign'} 
            onClose={() => setModalState('none')} 
            demo={activeDemo} 
            onSuccess={handleActionSuccess} 
          />
          <CancelDemoModal 
            isOpen={modalState === 'cancel'} 
            onClose={() => setModalState('none')} 
            demo={activeDemo} 
            onSuccess={handleActionSuccess} 
          />
          <NoShowDemoModal 
            isOpen={modalState === 'noshow'} 
            onClose={() => setModalState('none')} 
            demo={activeDemo} 
            onSuccess={handleActionSuccess} 
          />
        </>
      )}
    </>
  );
}
