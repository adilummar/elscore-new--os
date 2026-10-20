'use client';

import * as React from 'react';
import Link from 'next/link';
import { getDemoById, recordWhatsAppOutreach } from '../../actions';
import { usePermissions, useAuth } from '@/components/providers/AuthProvider';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Timeline } from '@/components/ui/Timeline';
import { OperationalStageBadge } from '../../components/DemoList';

// Modals
import { RescheduleDemoModal } from '../../components/RescheduleDemoModal';
import { AssignTutorModal } from '../../components/AssignTutorModal';
import { CompleteDemoModal } from '../../components/CompleteDemoModal';
import { CancelDemoModal } from '../../components/CancelDemoModal';
import { NoShowDemoModal } from '../../components/NoShowDemoModal';
import { EditDemoModal } from '../../components/EditDemoModal';
import { PreparationModal } from '../../components/PreparationModal';
import { MeetingLinkModal } from '../../components/MeetingLinkModal';
import { ParentConfirmationModal } from '../../components/ParentConfirmationModal';
import { ReassignCoordinatorModal } from '../../components/ReassignCoordinatorModal';
import { WhatsAppPreviewModal } from '../../components/WhatsAppPreviewModal';

import {
  CheckCircle2,
  CheckCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Link2,
  Share2,
  UserCheck,
  ExternalLink,
  Video,
  Phone,
  Mail,
  MoreHorizontal,
  ChevronRight,
  Sparkles,
  FileText,
  Award
} from 'lucide-react';

function formatDate(dateStr: string) {
  if (!dateStr) return 'Pending';
  return new Intl.DateTimeFormat('en-IN', { 
    month: 'long', day: 'numeric', year: 'numeric' 
  }).format(new Date(dateStr));
}

function formatTime(dateStr: string) {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('en-IN', { 
    hour: 'numeric', minute: '2-digit', hour12: true 
  }).format(new Date(dateStr));
}

const PIPELINE_STAGES = [
  { id: 'VALID_DEMO', label: '1. Valid Demo' },
  { id: 'PREPARATION', label: '2. Preparation' },
  { id: 'TUTOR_ASSIGNED', label: '3. Tutor Assigned' },
  { id: 'LINK_SHARED', label: '4. Link Shared' },
  { id: 'PARENT_CONFIRMATION', label: '5. Parent Confirmed' },
  { id: 'COMPLETED', label: '6. Completed' },
];

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
  const { user, effectiveUser } = useAuth();
  const [demo, setDemo] = React.useState<any>(initialDemo);
  const [isLoading, setIsLoading] = React.useState(!initialDemo && !initialError);
  const [error, setError] = React.useState<string | null>(initialError);
  const [isWhatsAppLoading, setIsWhatsAppLoading] = React.useState(false);
  
  const [modalState, setModalState] = React.useState<
    'none' | 'reschedule' | 'edit' | 'assign' | 'complete' | 'cancel' | 'noshow' | 'preparation' | 'meetingLink' | 'parentConfirm' | 'reassignCoord' | 'whatsappPreview'
  >('none');

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

  const handleActionSuccess = () => {
    setModalState('none');
    loadDemo();
  };

  const handleWhatsAppOutreach = async () => {
    if (!demo) return;
    const demoId = demo.booking?.id || demo.id;
    setIsWhatsAppLoading(true);
    try {
      const res = await recordWhatsAppOutreach(demoId);
      if (res.success && res.data?.whatsappUrl) {
        window.open(res.data.whatsappUrl, '_blank');
        loadDemo();
      } else {
        alert(res.error || 'Failed to generate WhatsApp outreach link');
      }
    } catch (err: any) {
      alert(err.message || 'Error triggering WhatsApp outreach');
    } finally {
      setIsWhatsAppLoading(false);
    }
  };

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

  const currentStage = demo.operationalStage || 'VALID_DEMO';
  const isTerminal = ['COMPLETED', 'CANCELLED'].includes(demo.status) || currentStage === 'COMPLETED' || currentStage === 'CANCELLED';
  const isNoShow = demo.status === 'NO_SHOW' || currentStage === 'NOT_SHOW';

  // User & Ownership Context
  const currentUserId = effectiveUser?.id || user?.id;

  const lead = demo.lead || demo.booking?.lead || demo.student?.lead;
  const leadOwnerId = lead?.assignedToUserId;
  const bookerId = demo.bookedByUserId || demo.booking?.bookedByUserId;

  const isLeadOwner = Boolean(currentUserId && leadOwnerId && currentUserId === leadOwnerId);
  const isBooker = Boolean(!leadOwnerId && currentUserId && bookerId && currentUserId === bookerId);
  const isSalesHead = hasPermission('demo.manage_team') || (effectiveUser?.roles?.includes('SALES_HEAD') ?? false);
  const isCeo = hasPermission('analytics.ceo.read') || (effectiveUser?.roles?.includes('CEO') ?? false);
  const canManageSales = Boolean(isCeo || isSalesHead || hasPermission('lead.manage_all') || hasPermission('demo.manage_all'));
  const canSalesOutreach = Boolean(isLeadOwner || isBooker || canManageSales);

  // Permissions
  const canReschedule = hasPermission('demo.reschedule') || hasPermission('demo.reschedule_own') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canEdit = hasPermission('demo.reschedule') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canCancel = hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || hasPermission('demo.cancel_own') || hasPermission('demo.cancel') || hasPermission('demo.manage_operations');
  const canAssign = hasPermission('demo.assign_tutor') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canComplete = hasPermission('demo.complete') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canMarkExceptions = hasPermission('demo.mark_exceptions') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all') || hasPermission('demo.manage_operations');
  const canManageCoord = hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || hasPermission('demo.manage_operations') || hasPermission('demo.coordinate');
  const canRecordMeetingLink = hasPermission('demo.manage_operations') || hasPermission('demo.assign_tutor') || hasPermission('demo.coordinate') || hasPermission('demo.manage_all');

  // Multi-session & booking info
  const sessions = demo.booking?.sessions || [];
  const coordinator = demo.coordinator || demo.booking?.coordinator;
  const coordinatorName = coordinator?.employee?.firstName
    ? `${coordinator.employee.firstName} ${coordinator.employee.lastName || ''}`.trim()
    : coordinator?.email || null;

  // Pipeline stepper state
  const stageOrder = ['VALID_DEMO', 'PREPARATION', 'TUTOR_ASSIGNED', 'LINK_SHARED', 'PARENT_CONFIRMATION', 'COMPLETED'];
  const currentStageIndex = stageOrder.indexOf(currentStage);

  // History timeline mapping
  const auditLogs = demo.auditLogs || [];
  const reschedules = demo.booking?.rescheduleHistory || demo.rescheduleHistory || [];
  const stageHistory = demo.stageHistory || demo.booking?.stageHistory || [];
  const linkHistory = demo.meetingLinkHistory || demo.booking?.meetingLinkHistory || [];

  const timelineItems = [
    ...stageHistory.map((s: any) => ({
      id: s.id || `stage-${Math.random()}`,
      title: `Stage: ${s.newStage.replace(/_/g, ' ')}`,
      description: s.reason ? `Reason: ${s.reason}` : (s.changedByUser?.employee?.firstName ? `Updated by ${s.changedByUser.employee.firstName}` : 'Stage transition'),
      date: s.changedAt || new Date().toISOString(),
      type: 'stage',
    })),
    ...linkHistory.map((l: any) => ({
      id: l.id || `link-${Math.random()}`,
      title: `Meeting Link Recorded (${l.meetingPlatform || 'Link'})`,
      description: l.reason ? `Update: ${l.reason}` : `Link: ${l.meetingLink}`,
      date: l.createdAt || new Date().toISOString(),
      type: 'link',
    })),
    ...reschedules.map((r: any) => ({
      id: r.id || `resched-${Math.random()}`,
      title: 'Demo Rescheduled',
      description: r.reason ? `Reason: ${r.reason}` : 'Rescheduled to new date/time',
      date: r.createdAt || r.newScheduledAt || r.newDate || new Date().toISOString(),
      type: 'reschedule',
    })),
    ...auditLogs.map((log: any) => ({
      id: log.id || `audit-${Math.random()}`,
      title: (log.action || 'ACTION').replace(/_/g, ' '),
      description: log.reason || (log.actorUserId ? `Action by user ${log.actorUserId}` : 'System update'),
      date: log.createdAt || log.timestamp || new Date().toISOString(),
      type: 'audit',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center space-x-2 text-sm text-slate-500">
        <Link href="/demos" className="hover:text-slate-900 transition-colors">Demos</Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{demo.businessId || demo.id}</span>
      </div>

      {/* Main Header & Stage Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {demo.businessId || 'Demo Details'}
              </h1>
              <OperationalStageBadge stage={currentStage} isRescheduled={demo.isRescheduled} />
            </div>
            <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
              <span>{formatDate(demo.scheduledAt)} at {formatTime(demo.scheduledAt)}</span>
              <span>•</span>
              <span>{demo.durationMinutes || 60} mins</span>
              {demo.booking?.businessId && (
                <>
                  <span>•</span>
                  <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    Booking: {demo.booking.businessId}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Contextual / Stage-Driven Primary Actions */}
            {currentStage === 'VALID_DEMO' && (
              <Button onClick={() => setModalState('preparation')} className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
                <BookOpen className="w-4 h-4" />
                <span>Prepare Class Guidelines</span>
              </Button>
            )}

            {currentStage === 'PREPARATION' && canAssign && (
              <Button onClick={() => setModalState('assign')} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
                <span>Assign Tutor</span>
              </Button>
            )}

            {currentStage === 'TUTOR_ASSIGNED' && (
              <Button onClick={() => setModalState('meetingLink')} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
                <Link2 className="w-4 h-4" />
                <span>Add Meeting Link</span>
              </Button>
            )}

            {currentStage === 'LINK_SHARED' && (
              <>
                {canSalesOutreach && (
                  <>
                    <Button 
                      onClick={() => setModalState('whatsappPreview')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share on WhatsApp</span>
                    </Button>
                    <Button onClick={() => setModalState('parentConfirm')} variant="outline" className="text-teal-700 border-teal-300 hover:bg-teal-50 gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      <span>Confirm Parent</span>
                    </Button>
                  </>
                )}
                {canRecordMeetingLink && (
                  <Button onClick={() => setModalState('meetingLink')} variant="outline" className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1.5">
                    <Link2 className="w-4 h-4" />
                    <span>{demo.meetingLink ? 'Update Meeting Link' : 'Add Meeting Link'}</span>
                  </Button>
                )}
              </>
            )}

            {currentStage === 'PARENT_CONFIRMATION' && (
              <>
                {canComplete && (
                  <Button onClick={() => setModalState('complete')} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                    Complete Demo
                  </Button>
                )}
                {canMarkExceptions && (
                  <Button variant="outline" onClick={() => setModalState('noshow')} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                    Mark No-Show
                  </Button>
                )}
              </>
            )}

            {/* Completed Demo Evaluation Review / Edit */}
            {currentStage === 'COMPLETED' && canComplete && (
              <Button
                variant="outline"
                onClick={() => setModalState('complete')}
                className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 gap-1.5 font-medium shadow-2xs"
              >
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Evaluation & Roadmap</span>
              </Button>
            )}

            {/* No-Show Recovery Reschedule Action */}
            {isNoShow && canReschedule && (
              <Button onClick={() => setModalState('reschedule')} className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5">
                <RotateCcw className="w-4 h-4" />
                <span>Reschedule Demo</span>
              </Button>
            )}

            {/* General Actions for Non-Terminal Demos */}
            {!isTerminal && !isNoShow && (
              <>
                {canReschedule && (
                  <Button variant="outline" onClick={() => setModalState('reschedule')}>Reschedule</Button>
                )}
                {canEdit && (
                  <Button variant="outline" onClick={() => setModalState('edit')}>Edit</Button>
                )}
                {canCancel && (
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setModalState('cancel')}>
                    Cancel
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 6-Stage Operational Stepper */}
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
            Operational Progression
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {PIPELINE_STAGES.map((step, idx) => {
              const isPast = currentStageIndex > idx;
              const isCurrent = currentStageIndex === idx;
              return (
                <div
                  key={step.id}
                  className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${
                    isCurrent
                      ? 'bg-blue-50/80 border-blue-400 text-blue-900 shadow-sm ring-1 ring-blue-300'
                      : isPast
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{step.label}</span>
                    {isPast && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    {isCurrent && <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Exception Alerts */}
          {isNoShow && (
            <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span><strong>No-Show Encountered:</strong> This demo was marked as no-show. You can recover it by rescheduling to a new slot.</span>
              </div>
              {canReschedule && (
                <button
                  onClick={() => setModalState('reschedule')}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shrink-0"
                >
                  Reschedule Now
                </button>
              )}
            </div>
          )}

          {demo.isRescheduled && currentStage !== 'NOT_SHOW' && (
            <div className="mt-3 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-orange-600 shrink-0" />
              <span><strong>Rescheduled Demo:</strong> This booking has been rescheduled. Previous session records are preserved in audit history.</span>
            </div>
          )}
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Span 2): Operational Cards, Sessions, Student & Tutor Details */}
        <div className="lg:col-span-2 space-y-6">

          {/* 1. Operational Workflow Control Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Preparation Guidelines Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Class Preparation</h3>
                    <p className="text-[11px] text-slate-500">&ldquo;How to take the class&rdquo; instructions</p>
                  </div>
                </div>
                {demo.preparationNotes ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Saved
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Required
                  </span>
                )}
              </div>

              {demo.preparationNotes ? (
                <div className="bg-amber-50/40 border border-amber-100 rounded-lg p-3 text-xs text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {demo.preparationNotes}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-100">
                  No preparation instructions saved yet. Tutor assignment is gated until instructions (min 15 characters) are recorded.
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {demo.preparedByUser?.employee?.firstName 
                    ? `Prepared by ${demo.preparedByUser.employee.firstName}` 
                    : demo.preparedByUser?.email || 'Coordinator Gate'}
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setModalState('preparation')}
                  className="text-xs"
                >
                  {demo.preparationNotes ? 'Edit Instructions' : 'Draft Instructions'}
                </Button>
              </div>
            </div>

            {/* Meeting Link & Platform Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Meeting Link</h3>
                    <p className="text-[11px] text-slate-500">Video conference coordinates</p>
                  </div>
                </div>
                {demo.meetingLink ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Ready
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                    Pending
                  </span>
                )}
              </div>

              {demo.meetingLink ? (
                <div className="bg-indigo-50/40 border border-indigo-100 rounded-lg p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-indigo-900 uppercase text-[10px] tracking-wider">
                      {demo.meetingPlatform || 'Video Meeting'}
                    </span>
                    <a
                      href={demo.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 text-[11px] hover:underline"
                    >
                      <span>Join Call</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="font-mono text-slate-700 truncate">{demo.meetingLink}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-100">
                  Meeting link has not been recorded yet. Sales outreach is gated until internal link sharing.
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {linkHistory.length > 0 ? `${linkHistory.length} revisions` : 'Internal share'}
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setModalState('meetingLink')}
                  className="text-xs"
                >
                  {demo.meetingLink ? 'Update Link' : 'Add Link'}
                </Button>
              </div>
            </div>

            {/* Sales Outreach & Parent Confirmation Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Parent Confirmation</h3>
                    <p className="text-[11px] text-slate-500">Sales outreach & attendance RSVP</p>
                  </div>
                </div>
                {demo.parentConfirmedAt ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Parent Confirmed
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Awaiting Sales Confirmation
                  </span>
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-600">WhatsApp Share:</span>
                  {demo.whatsappOpenedAt ? (
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Shared ({formatDate(demo.whatsappOpenedAt)})
                    </span>
                  ) : canSalesOutreach ? (
                    <button
                      disabled={!demo.meetingLink}
                      onClick={() => setModalState('whatsappPreview')}
                      className="text-blue-600 hover:text-blue-800 font-medium hover:underline disabled:text-slate-400"
                    >
                      Preview & Share WhatsApp
                    </button>
                  ) : (
                    <span className="text-slate-400 italic">Pending Sales Outreach</span>
                  )}
                </div>

                {demo.parentConfirmedAt && (
                  <div className="bg-teal-50/40 border border-teal-100 p-2.5 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-teal-900 font-medium">
                      <span>Channel: {demo.confirmationChannel || demo.parentConfirmationChannel || 'WhatsApp'}</span>
                      <span className="text-[10px] text-teal-700">{formatDate(demo.parentConfirmedAt)}</span>
                    </div>
                    {(demo.parentConfirmedByUser || demo.parentConfirmedByUserId) && (
                      <p className="text-[11px] text-teal-800">
                        Confirmed by: <span className="font-medium">{demo.parentConfirmedByUser?.employee?.firstName ? `${demo.parentConfirmedByUser.employee.firstName} ${demo.parentConfirmedByUser.employee.lastName || ''}`.trim() : (demo.parentConfirmedByUser?.email || demo.parentConfirmedByUserId)}</span>
                      </p>
                    )}
                    {(demo.confirmationNotes || demo.parentConfirmationNotes) && (
                      <p className="text-slate-600 text-[11px] italic">
                        &ldquo;{demo.confirmationNotes || demo.parentConfirmationNotes}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </div>

              {canSalesOutreach && (!isTerminal || demo.parentConfirmedAt) && (
                <div className="flex items-center justify-end pt-1">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setModalState('parentConfirm')}
                    className="text-xs"
                  >
                    {demo.parentConfirmedAt ? 'Update RSVP' : 'Record Confirmation'}
                  </Button>
                </div>
              )}
            </div>

            {/* Coordinator Round-Robin & Ownership Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Coordinator</h3>
                    <p className="text-[11px] text-slate-500">Round-robin operations manager</p>
                  </div>
                </div>
                {coordinatorName ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    Assigned
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Unassigned
                  </span>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                {coordinatorName ? (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-900">{coordinatorName}</p>
                    <p className="text-slate-500 text-[11px]">{coordinator?.email}</p>
                  </div>
                ) : (
                  <p className="text-slate-400 italic">
                    No coordinator currently assigned to this demo booking.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">Atomic allocation</span>
                {canManageCoord && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setModalState('reassignCoord')}
                    className="text-xs"
                  >
                    {coordinatorName ? 'Reassign' : 'Assign Coordinator'}
                  </Button>
                )}
              </div>
            </div>

          </div>

          {/* 2. Subject Sessions Section */}
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
              <div className="space-y-3">
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
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {session.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Student & Requirement */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Student & Requirement</h3>
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Student</p>
                <p className="text-slate-900 mt-1 font-medium">{demo.student?.firstName || 'Student'} {demo.student?.lastName || ''}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Subject</p>
                <p className="text-slate-900 mt-1">{demo.subject?.name || demo.booking?.sessions?.[0]?.subject?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Grade</p>
                <p className="text-slate-900 mt-1">{demo.grade?.name || demo.booking?.sessions?.[0]?.grade?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Curriculum</p>
                <p className="text-slate-900 mt-1">{demo.curriculum?.name || demo.booking?.sessions?.[0]?.curriculum?.name || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-slate-500">Requirement Notes</p>
                <p className="text-slate-900 mt-1 bg-slate-50 p-3 rounded-lg text-sm border border-slate-100">
                  {demo.requirement?.notes || 'No specific requirement notes provided.'}
                </p>
              </div>
            </div>
          </div>

          {/* 4. Tutor Details */}
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
                No primary tutor assigned yet.
              </div>
            )}
          </div>

          {/* 5. Outcome & Evaluation */}
          {(demo.feedbackRecord || demo.booking?.feedbackRecord || (demo.feedback && demo.feedback.length > 0)) && (() => {
            const fb = demo.feedbackRecord || demo.booking?.feedbackRecord || (Array.isArray(demo.feedback) ? demo.feedback[0] : demo.feedback);
            const rm = demo.roadmap || demo.booking?.roadmap;
            const ap = demo.academicPlan || demo.booking?.academicPlan;

            return (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-emerald-200/60">
                  <h3 className="text-base font-bold text-emerald-950 flex items-center gap-2">
                    <Award className="w-5 h-5 text-emerald-700" />
                    Demo Outcome & Multi-Role Evaluation
                  </h3>
                  {fb?.rating && (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-900 rounded-full font-bold text-sm shadow-2xs">
                      {fb.rating} ⭐ Overall Rating
                    </span>
                  )}
                </div>

                {/* Tutor Evaluation */}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Student Performance & Tutor Feedback</p>
                    <p className="text-slate-800 mt-1 bg-white p-3.5 rounded-lg text-sm border border-emerald-100 shadow-2xs leading-relaxed">
                      {fb?.comments || fb?.studentPerformance || 'No feedback comments recorded.'}
                    </p>
                  </div>

                  {(fb?.strengths || fb?.weaknesses || fb?.tutorRecommendations) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      {fb?.strengths && (
                        <div className="bg-white/80 p-3 rounded-lg border border-emerald-100 text-xs">
                          <span className="font-semibold text-emerald-900 block mb-0.5">Strengths</span>
                          <span className="text-slate-700">{fb.strengths}</span>
                        </div>
                      )}
                      {fb?.weaknesses && (
                        <div className="bg-white/80 p-3 rounded-lg border border-emerald-100 text-xs">
                          <span className="font-semibold text-amber-900 block mb-0.5">Areas for Improvement</span>
                          <span className="text-slate-700">{fb.weaknesses}</span>
                        </div>
                      )}
                      {fb?.tutorRecommendations && (
                        <div className="bg-white/80 p-3 rounded-lg border border-emerald-100 text-xs sm:col-span-1">
                          <span className="font-semibold text-indigo-900 block mb-0.5">Recommendations</span>
                          <span className="text-slate-700">{fb.tutorRecommendations}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Coordinator & Parent Evaluation */}
                {(fb?.academicAssessment || fb?.engagementLevel || fb?.parentFeedback || fb?.parentInterestLevel) && (
                  <div className="pt-3 border-t border-emerald-200/60">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-900 mb-3 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      Coordinator & Parent Observations
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {fb?.academicAssessment && (
                        <div className="bg-white p-3.5 rounded-lg border border-indigo-100 text-xs shadow-2xs">
                          <span className="font-bold text-slate-700 block mb-1">Academic Assessment (Coordinator)</span>
                          <p className="text-slate-800 leading-relaxed">{fb.academicAssessment}</p>
                        </div>
                      )}
                      {fb?.engagementLevel && (
                        <div className="bg-white p-3.5 rounded-lg border border-indigo-100 text-xs shadow-2xs">
                          <span className="font-bold text-slate-700 block mb-1">Student Engagement Level</span>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {fb.engagementLevel}
                          </span>
                        </div>
                      )}
                      {fb?.parentFeedback && (
                        <div className="bg-white p-3.5 rounded-lg border border-indigo-100 text-xs shadow-2xs">
                          <span className="font-bold text-slate-700 block mb-1">Parent Feedback</span>
                          <p className="text-slate-800 leading-relaxed">{fb.parentFeedback}</p>
                        </div>
                      )}
                      {fb?.parentInterestLevel && (
                        <div className="bg-white p-3.5 rounded-lg border border-indigo-100 text-xs shadow-2xs">
                          <span className="font-bold text-slate-700 block mb-1">Parent Interest Level</span>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {fb.parentInterestLevel}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Academic Roadmap Summary */}
                {(rm || ap) && (
                  <div className="pt-3 border-t border-emerald-200/60">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-900 mb-3 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-brand-600" />
                      4-Week Academic Acceleration Plan
                    </p>
                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3 text-xs shadow-2xs">
                      {rm?.recommendationPlan && (
                        <div>
                          <strong className="text-slate-800">Plan Title: </strong>
                          <span className="text-slate-700">{rm.recommendationPlan}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-4 text-slate-600">
                        {rm?.recommendedClassCount && <span><strong>Classes:</strong> {rm.recommendedClassCount}</span>}
                        {rm?.recommendedFrequency && <span><strong>Frequency:</strong> {rm.recommendedFrequency}</span>}
                        {rm?.preferredTiming && <span><strong>Timing:</strong> {rm.preferredTiming}</span>}
                      </div>
                      {ap?.learningGoal && (
                        <div className="pt-2 border-t border-slate-100">
                          <strong className="text-slate-800">Learning Goal: </strong>
                          <span className="text-slate-700">{ap.learningGoal}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        </div>

        {/* Right Column (Span 1): Demo History & Timeline */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Workflow & History</h3>
            {timelineItems.length > 0 ? (
              <Timeline>
                {timelineItems.map((item: any) => (
                  <div key={item.id} className="mb-6 ml-6 last:mb-0">
                    <span className="absolute flex items-center justify-center w-3 h-3 bg-blue-500 rounded-full -left-1.5 ring-4 ring-white" />
                    <h4 className="font-medium text-slate-900 text-sm">{item.title}</h4>
                    <time className="block mb-1 text-xs font-normal leading-none text-slate-400">
                      {new Intl.DateTimeFormat('en-IN', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric', 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      }).format(new Date(item.date))}
                    </time>
                    <p className="text-xs font-normal text-slate-500 mt-1">{item.description}</p>
                  </div>
                ))}
              </Timeline>
            ) : (
              <p className="text-slate-500 text-sm italic">No history available.</p>
            )}
          </div>
        </div>

      </div>

      {/* Workflow Modals */}
      <PreparationModal 
        isOpen={modalState === 'preparation'}
        onClose={() => setModalState('none')}
        demo={demo}
        onSuccess={handleActionSuccess}
      />
      <MeetingLinkModal
        isOpen={modalState === 'meetingLink'}
        onClose={() => setModalState('none')}
        demo={demo}
        onSuccess={handleActionSuccess}
      />
      <ParentConfirmationModal
        isOpen={modalState === 'parentConfirm'}
        onClose={() => setModalState('none')}
        demo={demo}
        onSuccess={handleActionSuccess}
      />
      <WhatsAppPreviewModal
        isOpen={modalState === 'whatsappPreview'}
        onClose={() => setModalState('none')}
        demo={demo}
        onSuccess={handleActionSuccess}
      />
      <ReassignCoordinatorModal
        isOpen={modalState === 'reassignCoord'}
        onClose={() => setModalState('none')}
        demo={demo}
        onSuccess={handleActionSuccess}
      />
      <RescheduleDemoModal 
        isOpen={modalState === 'reschedule'} 
        onClose={() => setModalState('none')} 
        demo={demo} 
        onSuccess={handleActionSuccess} 
      />
      <EditDemoModal 
        isOpen={modalState === 'edit'} 
        onClose={() => setModalState('none')} 
        demo={demo} 
        lead={demo?.student?.lead || demo?.booking?.lead} 
        onSuccess={handleActionSuccess} 
      />
      <AssignTutorModal 
        isOpen={modalState === 'assign'} 
        onClose={() => setModalState('none')} 
        demo={demo} 
        onSuccess={handleActionSuccess} 
      />
      <CompleteDemoModal 
        isOpen={modalState === 'complete'} 
        onClose={() => setModalState('none')} 
        demo={demo} 
        onSuccess={handleActionSuccess} 
      />
      <CancelDemoModal 
        isOpen={modalState === 'cancel'} 
        onClose={() => setModalState('none')} 
        demo={demo} 
        onSuccess={handleActionSuccess} 
      />
      <NoShowDemoModal 
        isOpen={modalState === 'noshow'} 
        onClose={() => setModalState('none')} 
        demo={demo} 
        onSuccess={handleActionSuccess} 
      />
    </div>
  );
}
