"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/components/providers/AuthProvider';
import { Calendar, Video, Plus } from 'lucide-react';

import { RescheduleDemoModal } from '../../../demos/components/RescheduleDemoModal';
import { CancelDemoModal } from '../../../demos/components/CancelDemoModal';
import { EditDemoModal } from '../../../demos/components/EditDemoModal';

export function DemosTab({
  lead,
  onUpdate,
  onBookDemo,
}: {
  lead: any;
  onUpdate?: () => void;
  onBookDemo?: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [activeDemo, setActiveDemo] = React.useState<any>(null);
  const [modalState, setModalState] = React.useState<'none' | 'reschedule' | 'cancel' | 'edit'>('none');

  // Collect all bookings from lead and students, deduping by id
  const bookingMap = new Map<string, any>();
  if (Array.isArray(lead?.demoBookings)) {
    for (const b of lead.demoBookings) {
      bookingMap.set(b.id, b);
    }
  }
  for (const s of lead?.students || []) {
    if (Array.isArray(s.demoBookings)) {
      for (const b of s.demoBookings) {
        if (!bookingMap.has(b.id)) {
          bookingMap.set(b.id, { ...b, student: b.student || s });
        }
      }
    }
  }

  // Linked legacy IDs from bookings
  const linkedLegacyDemoIds = new Set<string>();
  for (const b of bookingMap.values()) {
    if (b.legacyDemoId) {
      linkedLegacyDemoIds.add(b.legacyDemoId);
    }
  }

  // Unlinked legacy demos
  const legacyDemos = (lead?.students || []).flatMap((s: any) =>
    (s.demos || [])
      .filter((d: any) => !linkedLegacyDemoIds.has(d.id))
      .map((d: any) => ({
        id: d.id,
        isBooking: false,
        businessId: d.businessId || d.id,
        title: `${d.requirement?.subject?.name || d.subject?.name || 'Subject'} - ${d.requirement?.grade?.name || d.grade?.name || 'Grade'}`,
        status: d.status,
        studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        scheduledAt: d.scheduledAt,
        totalDurationMin: d.durationMinutes || 60,
        tutorName: d.tutor
          ? `${d.tutor.employee?.firstName || ''} ${d.tutor.employee?.lastName || ''}`.trim() || d.tutor.email
          : d.assignedTutor
          ? `${d.assignedTutor.firstName || ''} ${d.assignedTutor.lastName || ''}`.trim()
          : undefined,
        remarks: d.outcomeRemarks,
        feedbackRecord: d.feedback ? { rating: d.feedback.rating, comments: d.feedback.comments } : undefined,
        roadmap: undefined,
        academicPlan: undefined,
        rawItem: d,
      }))
  );

  // Formatted booking items
  const bookingItems = Array.from(bookingMap.values()).map((b: any) => {
    const student = b.student || (lead?.students || []).find((s: any) => s.id === b.studentId);
    const sessions = (b.sessions || []).slice().sort((x: any, y: any) => (x.sessionOrder ?? 1) - (y.sessionOrder ?? 1));
    const firstSession = sessions[0];
    const scheduledAt = firstSession?.scheduledStart || b.scheduledDate;

    let title = 'Multi-Session Demo';
    if (sessions.length === 1) {
      const s = sessions[0];
      const subj = s.subject?.name || s.requirement?.subject?.name || 'Subject';
      const grd = s.grade?.name || s.requirement?.grade?.name || 'Grade';
      title = `${subj} - ${grd}`;
    } else if (sessions.length > 1) {
      const subjects = sessions.map((s: any) => s.subject?.name || 'Subject').join(', ');
      title = `${b.businessId ? `${b.businessId}: ` : ''}${subjects} (${sessions.length} sessions)`;
    } else if (b.businessId) {
      title = `Demo Booking (${b.businessId})`;
    }

    const coord = b.coordinator;
    const coordinatorName = coord
      ? `${coord.employee?.firstName || ''} ${coord.employee?.lastName || ''}`.trim() || coord.email
      : undefined;

    return {
      id: b.id,
      isBooking: true,
      legacyDemoId: b.legacyDemoId,
      businessId: b.businessId,
      title,
      status: b.status,
      studentName: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Student',
      scheduledAt,
      totalDurationMin: b.totalDurationMin || (sessions.length ? sessions.reduce((acc: number, s: any) => acc + (s.durationMinutes || 0), 0) : 60),
      sessions,
      coordinatorName,
      tutorName: undefined,
      remarks: b.cancelReason,
      feedbackRecord: b.feedbackRecord,
      roadmap: b.roadmap,
      academicPlan: b.academicPlan,
      rawItem: b,
    };
  });

  const allDemos = [...bookingItems, ...legacyDemos].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  const handleActionSuccess = () => {
    setModalState('none');
    setActiveDemo(null);
    if (onUpdate) onUpdate();
  };

  const handleOpenAction = (item: any, action: 'reschedule' | 'cancel' | 'edit') => {
    const modalPayload = {
      id: item.legacyDemoId || item.id,
      scheduledAt: item.scheduledAt,
      durationMinutes: item.totalDurationMin,
      ...item.rawItem,
    };
    setActiveDemo(modalPayload);
    setModalState(action);
  };

  if (allDemos.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Demos</CardTitle>
          {onBookDemo && hasPermission('demo.book') && lead?.status === 'INTERESTED' && (
            <Button size="sm" onClick={onBookDemo} className="flex items-center gap-1.5">
              <Video className="w-4 h-4" />
              Book Demo
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center py-10 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <div className="w-12 h-12 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-brand-600" />
            </div>
            <p className="text-slate-800 font-semibold text-base mb-1">No demos scheduled for this lead</p>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mb-5">
              {lead?.status === 'INTERESTED'
                ? "Schedule a single-session or multi-session demo trial for this lead's student."
                : "Demos can only be scheduled when the lead is in INTERESTED status."}
            </p>
            {onBookDemo && hasPermission('demo.book') && lead?.status === 'INTERESTED' && (
              <Button onClick={onBookDemo} className="inline-flex items-center gap-2">
                <Video className="w-4 h-4" />
                Book Demo Now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Demos</h3>
        {onBookDemo && hasPermission('demo.book') && lead?.status === 'INTERESTED' && (
          <Button size="sm" onClick={onBookDemo} variant="outline" className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Book Another Demo
          </Button>
        )}
      </div>
      <div className="grid gap-4">
        {allDemos.map((demo: any) => {
          const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(demo.status);
          const hasMultipleSessions = demo.sessions && demo.sessions.length > 1;

          return (
            <Card key={demo.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-slate-900">{demo.title}</h4>
                  <Badge variant={
                    demo.status === 'SCHEDULED' ? 'info' :
                    demo.status === 'COMPLETED' ? 'success' :
                    demo.status === 'CANCELLED' ? 'danger' :
                    demo.status === 'NO_SHOW' ? 'warning' : 'default'
                  }>
                    {demo.status}
                  </Badge>
                  {demo.businessId && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                      {demo.businessId}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-500">
                  <p>
                    Student: <span className="font-medium text-slate-700">{demo.studentName}</span>
                  </p>
                  <p>
                    Scheduled: <span className="font-medium text-slate-700">{new Date(demo.scheduledAt).toLocaleString()} ({demo.totalDurationMin} min)</span>
                  </p>
                  {demo.coordinatorName && (
                    <p>
                      Coordinator: <span className="font-medium text-slate-700">{demo.coordinatorName}</span>
                    </p>
                  )}
                  {demo.tutorName && (
                    <p>
                      Tutor: <span className="font-medium text-slate-700">{demo.tutorName}</span>
                    </p>
                  )}
                </div>

                {hasMultipleSessions && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sessions ({demo.sessions.length})</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {demo.sessions.map((s: any, idx: number) => {
                        const activeTutorAssignment = (s.tutorAssignments || []).find((ta: any) => ta.status === 'ACTIVE');
                        const sessionTutor = activeTutorAssignment?.tutor;
                        const sessionTutorName = sessionTutor
                          ? `${sessionTutor.employee?.firstName || ''} ${sessionTutor.employee?.lastName || ''}`.trim() || sessionTutor.email
                          : 'Pending assignment';

                        return (
                          <div key={s.id || idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs space-y-1">
                            <div className="flex items-center justify-between font-medium text-slate-800">
                              <span>Session {s.sessionOrder || idx + 1}: {s.subject?.name || 'Subject'}</span>
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">{s.status}</Badge>
                            </div>
                            <div className="text-slate-500">
                              {new Date(s.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({s.durationMinutes} min)
                            </div>
                            <div className="text-slate-600">
                              Tutor: <span className="font-medium text-slate-700">{sessionTutorName}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {demo.remarks && (
                  <div className="mt-2 text-sm bg-slate-50 p-2 rounded max-w-sm">
                    <span className="font-medium">Remarks:</span> {demo.remarks}
                  </div>
                )}

                {demo.status === 'COMPLETED' && (demo.feedbackRecord || demo.roadmap || demo.academicPlan) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Completed Demo Evaluation
                      </span>
                      {demo.feedbackRecord?.rating && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {demo.feedbackRecord.rating} ⭐ Rating
                        </span>
                      )}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                      {demo.feedbackRecord && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                          <p className="font-semibold text-slate-700">Tutor Feedback & Performance</p>
                          <p className="text-slate-600">{demo.feedbackRecord.comments || demo.feedbackRecord.studentPerformance}</p>
                          {demo.feedbackRecord.strengths && (
                            <p className="text-slate-500"><strong className="text-slate-700">Strengths:</strong> {demo.feedbackRecord.strengths}</p>
                          )}
                          {demo.feedbackRecord.weaknesses && (
                            <p className="text-slate-500"><strong className="text-slate-700">Improvement:</strong> {demo.feedbackRecord.weaknesses}</p>
                          )}
                          {demo.feedbackRecord.parentInterestLevel && (
                            <p className="text-slate-500"><strong className="text-slate-700">Parent Interest:</strong> {demo.feedbackRecord.parentInterestLevel}</p>
                          )}
                        </div>
                      )}

                      {demo.roadmap && (
                        <div className="bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100 space-y-1">
                          <p className="font-semibold text-indigo-900">Academic Roadmap (4-Week Plan)</p>
                          <p className="text-indigo-800 font-medium">{demo.roadmap.recommendationPlan}</p>
                          <p className="text-indigo-700">
                            {demo.roadmap.recommendedClassCount} classes &bull; {demo.roadmap.recommendedFrequency}
                          </p>
                          {demo.roadmap.preferredTiming && (
                            <p className="text-indigo-600">Timing: {demo.roadmap.preferredTiming}</p>
                          )}
                        </div>
                      )}

                      {demo.academicPlan && (
                        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100 space-y-1 sm:col-span-2">
                          <p className="font-semibold text-amber-900">Academic Plan & Milestones</p>
                          <p className="text-amber-800"><strong className="text-amber-900">Goal:</strong> {demo.academicPlan.learningGoal}</p>
                          {demo.academicPlan.targetChapters && (
                            <p className="text-amber-700"><strong className="text-amber-900">Chapters:</strong> {demo.academicPlan.targetChapters}</p>
                          )}
                          {demo.academicPlan.milestones && (
                            <p className="text-amber-700"><strong className="text-amber-900">Milestones:</strong> {demo.academicPlan.milestones}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {!isTerminal && (
                <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                  {(hasPermission('demo.reschedule') || hasPermission('demo.reschedule_own') || hasPermission('demo.manage_team') || hasPermission('demo.manage_all')) && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleOpenAction(demo, 'reschedule')}
                      >
                        Reschedule
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleOpenAction(demo, 'edit')}
                      >
                        Edit
                      </Button>
                    </>
                  )}
                  {(hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || hasPermission('demo.cancel_own')) && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleOpenAction(demo, 'cancel')}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
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
            lead={lead}
            onSuccess={handleActionSuccess} 
          />
          <CancelDemoModal 
            isOpen={modalState === 'cancel'} 
            onClose={() => setModalState('none')} 
            demo={activeDemo} 
            onSuccess={handleActionSuccess} 
          />
        </>
      )}
    </div>
  );
}
