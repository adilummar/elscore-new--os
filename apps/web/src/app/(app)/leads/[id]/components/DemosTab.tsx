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

  const demos = (lead?.students || []).flatMap((s: any) => 
    (s.demos || []).map((d: any) => ({ ...d, student: s }))
  ).sort((a: any, b: any) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const handleActionSuccess = () => {
    setModalState('none');
    setActiveDemo(null);
    if (onUpdate) onUpdate();
  };

  if (demos.length === 0) {
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
        {demos.map((demo: any) => {
          const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(demo.status);
          return (
            <Card key={demo.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-slate-900">
                    {demo.requirement?.subject?.name || 'Subject'} - {demo.requirement?.grade?.name || 'Grade'}
                  </h4>
                  <Badge variant={
                    demo.status === 'SCHEDULED' ? 'info' :
                    demo.status === 'COMPLETED' ? 'success' :
                    demo.status === 'CANCELLED' ? 'danger' :
                    demo.status === 'NO_SHOW' ? 'warning' : 'default'
                  }>
                    {demo.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500">
                  Student: <span className="font-medium text-slate-700">{demo.student?.firstName} {demo.student?.lastName}</span>
                </p>
                <p className="text-sm text-slate-500">
                  Scheduled: <span className="font-medium text-slate-700">{new Date(demo.scheduledAt).toLocaleString()} ({demo.durationMinutes} min)</span>
                </p>
                {demo.assignedTutor && (
                  <p className="text-sm text-slate-500">
                    Tutor: <span className="font-medium text-slate-700">{demo.assignedTutor.firstName} {demo.assignedTutor.lastName}</span>
                  </p>
                )}
                {demo.outcomeRemarks && (
                  <div className="mt-2 text-sm bg-slate-50 p-2 rounded max-w-sm">
                    <span className="font-medium">Remarks:</span> {demo.outcomeRemarks}
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
                        onClick={() => { setActiveDemo(demo); setModalState('reschedule'); }}
                      >
                        Reschedule
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => { setActiveDemo(demo); setModalState('edit'); }}
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
                      onClick={() => { setActiveDemo(demo); setModalState('cancel'); }}
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
