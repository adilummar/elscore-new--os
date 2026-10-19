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

export function DemoDetailClient({
  id,
  initialDemo = null,
  initialError = null,
}: {
  id: string;
  initialDemo?: any;
  initialError?: string | null;
}) {
  const { hasPermission } = usePermissions();
  const [demo, setDemo] = React.useState<any>(initialDemo);
  const [isLoading, setIsLoading] = React.useState(!initialDemo && !initialError);
  const [error, setError] = React.useState<string | null>(initialError);
  
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
    if (!initialDemo && !initialError) {
      loadDemo();
    }
  }, [loadDemo, initialDemo, initialError]);

  if (isLoading && !demo) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !demo) {
    return (
      <div className="max-w-xl mx-auto my-12">
        <ErrorState title="Unable to Load Demo" description={error} />
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => loadDemo()}>
            Try Again
          </Button>
          <Link href="/demos">
            <Button variant="ghost">Back to Demos</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!demo) return null;

  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(demo.status);
  
  // Transform audit logs and reschedule history into Timeline format
  const auditLogs = demo.auditLogs || [];
  const reschedules = demo.booking?.rescheduleHistory || demo.rescheduleHistory || [];
  
  const timelineItems = [
    ...auditLogs.map((log: any) => ({
      id: log.id || `audit-${Math.random()}`,
      title: (log.action || 'ACTION').replace(/_/g, ' '),
      description: log.reason || (log.actorUserId ? `Action by user ${log.actorUserId}` : 'System update'),
      date: log.createdAt || new Date().toISOString(),
      status: 'completed',
    })),
    ...reschedules.map((r: any) => ({
      id: r.id || `resched-${Math.random()}`,
      title: 'Rescheduled',
      description: r.reason ? `Reason: ${r.reason}` : 'Demo rescheduled',
      date: r.createdAt || r.newScheduledAt || r.newDate || new Date().toISOString(),
      status: 'completed',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleActionSuccess = () => {
    setModalState('none');
    loadDemo();
  };

  const sessions = demo.booking?.sessions || [];

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
            {(hasPermission('demo.reschedule') || hasPermission('demo.reschedule_own') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations')) && (
              <>
                <Button variant="outline" onClick={() => setModalState('reschedule')}>Reschedule</Button>
                <Button variant="outline" onClick={() => setModalState('edit')}>Edit</Button>
              </>
            )}
            {hasPermission('demo.assign_tutor') && (
              <Button variant="outline" onClick={() => setModalState('assign')}>Assign Tutor</Button>
            )}
            {demo.status === 'ASSIGNED' && (hasPermission('demo.mark_exceptions') || hasPermission('demo.manage_operations') || hasPermission('demo.manage_all')) && (
              <Button variant="outline" onClick={() => setModalState('noshow')}>Mark No-Show</Button>
            )}
            {(hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || hasPermission('demo.cancel_own') || hasPermission('demo.cancel') || hasPermission('demo.manage_operations')) && (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setModalState('cancel')}>
                Cancel
              </Button>
            )}
            {demo.status === 'ASSIGNED' && (hasPermission('demo.complete') || hasPermission('demo.manage_operations') || hasPermission('demo.manage_all')) && (
              <Button onClick={() => setModalState('complete')}>Complete Demo</Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          {sessions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Subject Sessions ({sessions.length})
                </h3>
                {demo.booking?.businessId && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                    Booking: {demo.booking.businessId}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {sessions.map((session: any) => {
                  const assignedTutor = session.tutorAssignments?.[0]?.tutor;
                  const tutorName = assignedTutor 
                    ? `${assignedTutor.firstName || assignedTutor.employee?.firstName || ''} ${assignedTutor.lastName || assignedTutor.employee?.lastName || ''}`.trim() || assignedTutor.email
                    : 'Unassigned';

                  return (
                    <div 
                      key={session.id} 
                      className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                            Session {session.sessionOrder}
                          </span>
                          <span className="font-semibold text-slate-900">
                            {session.subject?.name || 'Subject'}
                          </span>
                          <span className="text-xs text-slate-500">
                            • {session.grade?.name || ''} {session.curriculum?.name ? `(${session.curriculum.name})` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {session.scheduledStart ? `${formatDate(session.scheduledStart)} at ${formatTime(session.scheduledStart)}` : 'Schedule pending'} • {session.durationMinutes} mins
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs">
                          <p className="text-slate-500">Tutor</p>
                          <p className="font-medium text-slate-800">{tutorName}</p>
                        </div>
                        <StatusBadge status={session.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Student & Requirement</h3>
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Student</p>
                <p className="text-slate-900 mt-1">{demo.student?.firstName || 'Student'} {demo.student?.lastName || ''}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Subject</p>
                <p className="text-slate-900 mt-1">{demo.subject?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Grade</p>
                <p className="text-slate-900 mt-1">{demo.grade?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Curriculum</p>
                <p className="text-slate-900 mt-1">{demo.curriculum?.name || 'N/A'}</p>
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
                  {(demo.tutor.firstName?.[0] || demo.tutor.employee?.firstName?.[0] || demo.tutor.email?.[0] || 'T').toUpperCase()}
                  {(demo.tutor.lastName?.[0] || demo.tutor.employee?.lastName?.[0] || '').toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    {demo.tutor.firstName || demo.tutor.employee?.firstName || ''} {demo.tutor.lastName || demo.tutor.employee?.lastName || ''}
                    {!demo.tutor.firstName && !demo.tutor.employee?.firstName && (demo.tutor.email || 'Assigned Tutor')}
                  </p>
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
                <div key={fb.id || Math.random()} className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Rating</p>
                    <p className="text-emerald-900 mt-1 font-bold text-lg">{fb.rating || 5} ⭐</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Feedback Notes</p>
                    <p className="text-emerald-900 mt-1 bg-white/60 p-3 rounded-lg text-sm border border-emerald-100">
                      {fb.comments || 'No feedback comments recorded.'}
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
