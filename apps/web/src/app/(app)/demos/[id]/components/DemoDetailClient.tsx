'use client';

import * as React from 'react';
import Link from 'next/link';
import { getDemoById } from '../../actions';
import { usePermissions } from '@/components/providers/AuthProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Timeline } from '@/components/ui/Timeline';

// Modals
import { RescheduleDemoModal } from '../../components/RescheduleDemoModal';
import { AssignTutorModal } from '../../components/AssignTutorModal';
import { CompleteDemoModal } from '../../components/CompleteDemoModal';
import { CancelDemoModal } from '../../components/CancelDemoModal';
import { NoShowDemoModal } from '../../components/NoShowDemoModal';
import { EditDemoModal } from '../../components/EditDemoModal';

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { 
    month: 'long', day: 'numeric', year: 'numeric' 
  }).format(new Date(dateStr));
}

function formatTime(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { 
    hour: 'numeric', minute: '2-digit', hour12: true 
  }).format(new Date(dateStr));
}

export function DemoDetailClient({ id }: { id: string }) {
  const { hasPermission } = usePermissions();
  const [demo, setDemo] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  const [modalState, setModalState] = React.useState<'none' | 'reschedule' | 'edit' | 'assign' | 'complete' | 'cancel' | 'noshow'>('none');

  const loadDemo = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDemoById(id);
      setDemo(res.data || res);
    } catch (err: any) {
      setError(err.message || 'Failed to load demo detail');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    loadDemo();
  }, [loadDemo]);

  if (isLoading && !demo) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !demo) {
    return <ErrorState title="Error" description={error} />;
  }

  if (!demo) return null;

  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(demo.status);
  
  // Transform audit logs into Timeline format
  const auditLogs = demo.auditLogs || [];
  // The backend might also return demoRescheduleHistory
  const timelineItems = auditLogs.map((log: any) => ({
    id: log.id,
    title: log.action.replace(/_/g, ' '),
    description: log.reason || `Action performed by user ${log.actorUserId}`,
    date: log.createdAt,
    status: 'completed'
  }));

  const handleActionSuccess = () => {
    setModalState('none');
    loadDemo();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2 text-sm text-slate-500 mb-6">
        <Link href="/demos" className="hover:text-slate-900">Demos</Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{demo.businessId}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            {demo.businessId}
            <StatusBadge status={demo.status} />
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {formatDate(demo.scheduledAt)} at {formatTime(demo.scheduledAt)} • {demo.durationMinutes} mins
          </p>
        </div>

        {!isTerminal && (
          <div className="flex flex-wrap gap-2">
            {(hasPermission('demo.reschedule') || true) && (
              <>
                <Button variant="outline" onClick={() => setModalState('reschedule')}>Reschedule</Button>
                <Button variant="outline" onClick={() => setModalState('edit')}>Edit</Button>
              </>
            )}
            {hasPermission('demo.assign_tutor') && (
              <Button variant="outline" onClick={() => setModalState('assign')}>Assign Tutor</Button>
            )}
            {demo.status === 'ASSIGNED' && hasPermission('demo.mark_exceptions') && (
              <Button variant="outline" onClick={() => setModalState('noshow')}>Mark No-Show</Button>
            )}
            {(hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || true) && (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setModalState('cancel')}>
                Cancel
              </Button>
            )}
            {demo.status === 'ASSIGNED' && hasPermission('demo.complete') && (
              <Button onClick={() => setModalState('complete')}>Complete Demo</Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Student & Requirement</h3>
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Student</p>
                <p className="text-slate-900 mt-1">{demo.student?.firstName} {demo.student?.lastName}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Subject</p>
                <p className="text-slate-900 mt-1">{demo.subject?.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Grade</p>
                <p className="text-slate-900 mt-1">{demo.grade?.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Curriculum</p>
                <p className="text-slate-900 mt-1">{demo.curriculum?.name}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-slate-500">Requirement Notes</p>
                <p className="text-slate-900 mt-1 bg-slate-50 p-3 rounded-lg text-sm border border-slate-100">
                  {demo.requirement?.notes || 'No specific requirement notes provided.'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Tutor Details</h3>
            {demo.tutor ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                  {demo.tutor.firstName[0]}{demo.tutor.lastName[0]}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{demo.tutor.firstName} {demo.tutor.lastName}</p>
                  <p className="text-slate-500 text-sm">Assigned Tutor</p>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm italic">
                No Tutor assigned yet.
              </div>
            )}
          </div>

          {demo.feedback && demo.feedback.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-emerald-900 mb-4">Outcome & Feedback</h3>
              {demo.feedback.map((fb: any) => (
                <div key={fb.id} className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Rating</p>
                    <p className="text-emerald-900 mt-1 font-bold text-lg">{fb.rating} ⭐</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Feedback Notes</p>
                    <p className="text-emerald-900 mt-1 bg-white/60 p-3 rounded-lg text-sm border border-emerald-100">
                      {fb.comments}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Demo History</h3>
            {timelineItems.length > 0 ? (
              <Timeline>
                {timelineItems.map((item: any) => (
                  <div key={item.id} className="mb-6 ml-6 last:mb-0">
                    <span className="absolute flex items-center justify-center w-3 h-3 bg-blue-500 rounded-full -left-1.5 ring-4 ring-white" />
                    <h4 className="font-medium text-slate-900 text-sm">{item.title}</h4>
                    <time className="block mb-1 text-xs font-normal leading-none text-slate-400">
                      {new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.date))}
                    </time>
                    <p className="text-sm font-normal text-slate-500 mt-1">{item.description}</p>
                  </div>
                ))}
              </Timeline>
            ) : (
              <p className="text-slate-500 text-sm italic">No history available.</p>
            )}
          </div>
        </div>
      </div>

      <RescheduleDemoModal isOpen={modalState === 'reschedule'} onClose={() => setModalState('none')} demo={demo} onSuccess={handleActionSuccess} />
      <EditDemoModal isOpen={modalState === 'edit'} onClose={() => setModalState('none')} demo={demo} lead={demo?.student?.lead} onSuccess={handleActionSuccess} />
      <AssignTutorModal isOpen={modalState === 'assign'} onClose={() => setModalState('none')} demo={demo} onSuccess={handleActionSuccess} />
      <CompleteDemoModal isOpen={modalState === 'complete'} onClose={() => setModalState('none')} demo={demo} onSuccess={handleActionSuccess} />
      <CancelDemoModal isOpen={modalState === 'cancel'} onClose={() => setModalState('none')} demo={demo} onSuccess={handleActionSuccess} />
      <NoShowDemoModal isOpen={modalState === 'noshow'} onClose={() => setModalState('none')} demo={demo} onSuccess={handleActionSuccess} />
    </div>
  );
}
