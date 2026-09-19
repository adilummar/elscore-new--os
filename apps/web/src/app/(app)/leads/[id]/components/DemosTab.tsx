"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export function DemosTab({ lead }: { lead: any }) {
  const demos = (lead?.students || []).flatMap((s: any) => 
    (s.demos || []).map((d: any) => ({ ...d, student: s }))
  ).sort((a: any, b: any) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

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
        {demos.map((demo: any) => (
          <Card key={demo.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
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
            </div>
            {demo.outcomeRemarks && (
              <div className="text-sm bg-slate-50 p-2 rounded max-w-sm">
                <span className="font-medium">Remarks:</span> {demo.outcomeRemarks}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
