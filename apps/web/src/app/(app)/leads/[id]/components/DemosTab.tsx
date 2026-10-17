"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/components/providers/AuthProvider';

import { RescheduleDemoModal } from '../../../demos/components/RescheduleDemoModal';
import { CancelDemoModal } from '../../../demos/components/CancelDemoModal';
import { EditDemoModal } from '../../../demos/components/EditDemoModal';

export function DemosTab({ lead, onUpdate }: { lead: any; onUpdate?: () => void }) {
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
        <CardHeader><CardTitle>Demos</CardTitle></CardHeader>
        <CardContent>
          <div className="text-slate-500 italic p-4 text-center">No demos scheduled for this lead.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Demos</h3>
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
              </div>

              {!isTerminal && (
                <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                  {(hasPermission('demo.reschedule') || true) && (
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
                  {(hasPermission('demo.manage_all') || hasPermission('demo.manage_team') || true) && (
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
