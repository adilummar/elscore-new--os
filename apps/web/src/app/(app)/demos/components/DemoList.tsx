'use client';

import * as React from 'react';
import Link from 'next/link';
import { getDemos, recordWhatsAppOutreach } from '../actions';
import { usePermissions } from '@/components/providers/AuthProvider';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { RescheduleDemoModal } from './RescheduleDemoModal';
import { CompleteDemoModal } from './CompleteDemoModal';
import { AssignTutorModal } from './AssignTutorModal';
import { CancelDemoModal } from './CancelDemoModal';
import { NoShowDemoModal } from './NoShowDemoModal';
import { EditDemoModal } from './EditDemoModal';
import { PreparationModal } from './PreparationModal';
import { MeetingLinkModal } from './MeetingLinkModal';
import { ParentConfirmationModal } from './ParentConfirmationModal';
import { ReassignCoordinatorModal } from './ReassignCoordinatorModal';
import { 
  Share2, 
  CheckCircle, 
  Link2, 
  BookOpen, 
  UserCheck, 
  Calendar, 
  MoreHorizontal, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw,
  ExternalLink
} from 'lucide-react';

function formatDate(dateStr: string) {
  if (!dateStr) return 'Pending';
  return new Intl.DateTimeFormat('en-IN', { 
    month: 'short', day: 'numeric', year: 'numeric' 
  }).format(new Date(dateStr));
}

function formatTime(dateStr: string) {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('en-IN', { 
    hour: 'numeric', minute: '2-digit', hour12: true 
  }).format(new Date(dateStr));
}

export function OperationalStageBadge({ stage, isRescheduled }: { stage?: string; isRescheduled?: boolean }) {
  const stageConfig: Record<string, { label: string; className: string }> = {
    VALID_DEMO: { label: 'Valid Demo', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    PREPARATION: { label: 'Preparation', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    TUTOR_ASSIGNED: { label: 'Tutor Assigned', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    LINK_SHARED: { label: 'Link Shared', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    PARENT_CONFIRMATION: { label: 'Parent Confirmed', className: 'bg-teal-50 text-teal-700 border-teal-200' },
    COMPLETED: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    NOT_SHOW: { label: 'No-Show', className: 'bg-rose-50 text-rose-700 border-rose-200' },
    CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    RESCHEDULED: { label: 'Rescheduled', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  };

  const current = stageConfig[stage || 'VALID_DEMO'] || {
    label: stage || 'Valid Demo',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${current.className}`}>
        {current.label}
      </span>
      {isRescheduled && stage !== 'RESCHEDULED' && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200">
          Rescheduled
        </span>
      )}
    </div>
  );
}

export interface DemoListProps {
  view?: string;
  stage?: string;
}

export function DemoList({ view = 'all', stage = '' }: DemoListProps) {
  const { hasPermission } = usePermissions();
  const [data, setData] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);

  // Modals state
  const [activeDemo, setActiveDemo] = React.useState<any>(null);
  const [modalState, setModalState] = React.useState<
    'none' | 'reschedule' | 'edit' | 'complete' | 'assign' | 'cancel' | 'noshow' | 'preparation' | 'meetingLink' | 'parentConfirm' | 'reassignCoord'
  >('none');

  const loadDemos = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDemos({ 
        view: view === 'all' ? undefined : view, 
        stage: stage || undefined 
      });
      setData(res.data || res || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load demos');
    } finally {
      setIsLoading(false);
    }
  }, [view, stage]);

  React.useEffect(() => {
    loadDemos();
  }, [loadDemos]);

  const handleActionSuccess = () => {
    setModalState('none');
    setActiveDemo(null);
    loadDemos();
  };

  const handleWhatsAppOutreach = async (demo: any) => {
    const demoId = demo.booking?.id || demo.id;
    setActionLoadingId(demoId);
    try {
      const res = await recordWhatsAppOutreach(demoId);
      if (res.success && res.data?.whatsappUrl) {
        window.open(res.data.whatsappUrl, '_blank');
        loadDemos();
      } else {
        alert(res.error || 'Failed to generate WhatsApp outreach link');
      }
    } catch (err: any) {
      alert(err.message || 'Error triggering WhatsApp outreach');
    } finally {
      setActionLoadingId(null);
    }
  };

  const canReschedule = hasPermission('demo.reschedule') || hasPermission('demo.reschedule_own') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canEdit = hasPermission('demo.reschedule') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canCancel = hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || hasPermission('demo.cancel_own') || hasPermission('demo.cancel') || hasPermission('demo.manage_operations');
  const canAssign = hasPermission('demo.assign_tutor') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canComplete = hasPermission('demo.complete') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canMarkExceptions = hasPermission('demo.mark_exceptions') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canManageCoord = hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || hasPermission('demo.manage_operations') || hasPermission('demo.coordinate');

  if (isLoading && data.length === 0) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4].map((i) => (
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
        description={`There are no demos matching the selected criteria.`} 
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3.5 font-medium">Student & Requirement</th>
              <th className="px-6 py-3.5 font-medium">Schedule</th>
              <th className="px-6 py-3.5 font-medium">Operational Stage</th>
              <th className="px-6 py-3.5 font-medium">Coordinator</th>
              <th className="px-6 py-3.5 font-medium">Tutor</th>
              <th className="px-6 py-3.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.map((demo) => {
              const studentName = demo.student ? `${demo.student.firstName} ${demo.student.lastName}` : 'Unknown Student';
              const subjectName = demo.subject?.name || demo.booking?.sessions?.[0]?.subject?.name || 'Subject';
              const gradeName = demo.grade?.name || demo.booking?.sessions?.[0]?.grade?.name || '';
              const stage = demo.operationalStage || 'VALID_DEMO';
              const isTerminal = ['COMPLETED', 'CANCELLED'].includes(demo.status) || stage === 'COMPLETED' || stage === 'CANCELLED';
              const isNoShow = demo.status === 'NO_SHOW' || stage === 'NOT_SHOW';
              
              const coordinator = demo.coordinator || demo.booking?.coordinator;
              const coordinatorName = coordinator?.employee?.firstName 
                ? `${coordinator.employee.firstName} ${coordinator.employee.lastName || ''}`.trim()
                : coordinator?.email || null;

              const tutor = demo.tutor || demo.booking?.sessions?.[0]?.tutorAssignments?.[0]?.tutor;
              const tutorName = tutor?.employee?.firstName
                ? `${tutor.employee.firstName} ${tutor.employee.lastName || ''}`.trim()
                : tutor?.firstName
                ? `${tutor.firstName} ${tutor.lastName || ''}`.trim()
                : tutor?.email || null;

              return (
                <tr key={demo.id} className="hover:bg-slate-50/60 transition-colors">
                  {/* Student & Requirement */}
                  <td className="px-6 py-4">
                    <Link href={`/demos/${demo.id}`} className="font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                      {studentName}
                    </Link>
                    <div className="text-slate-500 mt-0.5 text-xs flex items-center gap-1.5">
                      <span>{subjectName}</span>
                      {gradeName && <span>• {gradeName}</span>}
                      {demo.businessId && (
                        <span className="font-mono text-[10px] text-slate-400">({demo.businessId})</span>
                      )}
                    </div>
                  </td>

                  {/* Schedule */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-slate-900 font-medium">{formatDate(demo.scheduledAt)}</div>
                    <div className="text-slate-500 mt-0.5 text-xs">{formatTime(demo.scheduledAt)}</div>
                  </td>

                  {/* Operational Stage */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <OperationalStageBadge stage={stage} isRescheduled={demo.isRescheduled} />
                    {demo.parentConfirmedAt && (
                      <div className="text-[11px] text-teal-600 font-medium mt-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Confirmed
                      </div>
                    )}
                  </td>

                  {/* Coordinator */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {coordinatorName ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-900 text-xs font-medium">{coordinatorName}</span>
                        {canManageCoord && (
                          <button
                            onClick={() => { setActiveDemo(demo); setModalState('reassignCoord'); }}
                            title="Reassign coordinator"
                            className="text-slate-400 hover:text-blue-600 text-[10px] underline"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setActiveDemo(demo); setModalState('reassignCoord'); }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                      >
                        <UserCheck className="w-3 h-3" />
                        <span>Assign</span>
                      </button>
                    )}
                  </td>

                  {/* Tutor */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {tutorName ? (
                      <span className="text-slate-900 text-xs font-medium">{tutorName}</span>
                    ) : (
                      <button
                        onClick={() => { setActiveDemo(demo); setModalState('assign'); }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"
                      >
                        <span>Assign Tutor</span>
                      </button>
                    )}
                  </td>

                  {/* Stage-Driven Actions */}
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      {/* Contextual primary action based on stage */}
                      {stage === 'VALID_DEMO' && (
                        <button
                          onClick={() => { setActiveDemo(demo); setModalState('preparation'); }}
                          className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-medium flex items-center gap-1"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>Add Prep</span>
                        </button>
                      )}

                      {stage === 'PREPARATION' && canAssign && (
                        <button
                          onClick={() => { setActiveDemo(demo); setModalState('assign'); }}
                          className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 font-medium flex items-center gap-1"
                        >
                          <span>Assign Tutor</span>
                        </button>
                      )}

                      {stage === 'TUTOR_ASSIGNED' && (
                        <button
                          onClick={() => { setActiveDemo(demo); setModalState('meetingLink'); }}
                          className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 font-medium flex items-center gap-1"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>Add Link</span>
                        </button>
                      )}

                      {stage === 'LINK_SHARED' && (
                        <>
                          <button
                            disabled={actionLoadingId === (demo.booking?.id || demo.id)}
                            onClick={() => handleWhatsAppOutreach(demo)}
                            className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium flex items-center gap-1"
                            title="Open WhatsApp message with parent"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </button>
                          <button
                            onClick={() => { setActiveDemo(demo); setModalState('parentConfirm'); }}
                            className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 font-medium flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Confirm</span>
                          </button>
                        </>
                      )}

                      {stage === 'PARENT_CONFIRMATION' && (
                        <>
                          {canComplete && (
                            <button
                              onClick={() => { setActiveDemo(demo); setModalState('complete'); }}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-medium shadow-sm"
                            >
                              Complete
                            </button>
                          )}
                          {canMarkExceptions && (
                            <button
                              onClick={() => { setActiveDemo(demo); setModalState('noshow'); }}
                              className="px-2 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                            >
                              No-Show
                            </button>
                          )}
                        </>
                      )}

                      {/* No-Show Recovery Reschedule Action */}
                      {isNoShow && canReschedule && (
                        <button
                          onClick={() => { setActiveDemo(demo); setModalState('reschedule'); }}
                          className="px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 font-medium flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reschedule</span>
                        </button>
                      )}

                      {/* General actions for non-terminal demos */}
                      {!isTerminal && !isNoShow && (
                        <>
                          {canReschedule && (
                            <button
                              onClick={() => { setActiveDemo(demo); setModalState('reschedule'); }}
                              className="text-slate-600 hover:text-slate-900"
                              title="Reschedule demo"
                            >
                              Reschedule
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => { setActiveDemo(demo); setModalState('cancel'); }}
                              className="text-rose-600 hover:text-rose-800"
                              title="Cancel demo"
                            >
                              Cancel
                            </button>
                          )}
                        </>
                      )}

                      <Link 
                        href={`/demos/${demo.id}`} 
                        className="text-blue-600 hover:text-blue-800 font-medium hover:underline inline-flex items-center gap-0.5 ml-1"
                      >
                        <span>View</span>
                      </Link>
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
          <PreparationModal 
            isOpen={modalState === 'preparation'}
            onClose={() => setModalState('none')}
            demo={activeDemo}
            onSuccess={handleActionSuccess}
          />
          <MeetingLinkModal
            isOpen={modalState === 'meetingLink'}
            onClose={() => setModalState('none')}
            demo={activeDemo}
            onSuccess={handleActionSuccess}
          />
          <ParentConfirmationModal
            isOpen={modalState === 'parentConfirm'}
            onClose={() => setModalState('none')}
            demo={activeDemo}
            onSuccess={handleActionSuccess}
          />
          <ReassignCoordinatorModal
            isOpen={modalState === 'reassignCoord'}
            onClose={() => setModalState('none')}
            demo={activeDemo}
            onSuccess={handleActionSuccess}
          />
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
            lead={activeDemo.student?.lead || activeDemo.booking?.lead}
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
