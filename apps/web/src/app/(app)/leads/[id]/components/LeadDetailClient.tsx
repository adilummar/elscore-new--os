"use client";

import * as React from 'react';
import { getLeadAction, archiveLeadAction } from '../../actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Timeline } from '@/components/ui/Timeline';
import { usePermissions } from '@/components/providers/AuthProvider';
import { User, Phone, MapPin, Calendar, CheckCircle, Clock } from 'lucide-react';
import { FollowUpPreview } from './FollowUpPreview';
import { SalesNotes } from './SalesNotes';
import { LeadStatusChangeDialog } from './LeadStatusChangeDialog';
import { BookDemoDialog } from './BookDemoDialog';
import { ReassignDialog } from './ReassignDialog';
import { MarketingAttributionCard } from './MarketingAttributionCard';

export function LeadDetailClient({ leadId }: { leadId: string }) {
  const [lead, setLead] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  const [isStatusOpen, setIsStatusOpen] = React.useState(false);
  const [isDemoOpen, setIsDemoOpen] = React.useState(false);
  const [isReassignOpen, setIsReassignOpen] = React.useState(false);

  const { hasPermission } = usePermissions();

  const loadLead = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLeadAction(leadId);
      setLead(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  React.useEffect(() => {
    loadLead();
  }, [loadLead]);

  if (loading) return <div className="p-8 text-center">Loading lead details...</div>;
  if (error) return <div className="p-8 text-center text-red-500 bg-red-50 rounded-md">{error}</div>;
  if (!lead) return <div className="p-8 text-center text-slate-500">Lead not found.</div>;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-slate-900">{lead.firstName} {lead.lastName}</h1>
            <Badge variant="info">{lead.status}</Badge>
            {lead.isArchived && <Badge variant="warning">ARCHIVED</Badge>}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-500 mt-2">
            <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {lead.primaryPhone}</span>
            <span className="flex items-center gap-1"><User className="w-4 h-4" /> Source: {lead.source}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Created: {new Date(lead.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission('lead.status.change') && (
            <Button onClick={() => setIsStatusOpen(true)} variant="outline">Change Status</Button>
          )}
          {hasPermission('demo.book') && (
            <Button onClick={() => setIsDemoOpen(true)} variant="outline">Book Demo</Button>
          )}
          {hasPermission('lead.reassign') && (
            <Button onClick={() => setIsReassignOpen(true)} variant="outline">Reassign</Button>
          )}
          {hasPermission('lead.archive') && !lead.isArchived && (
            <Button onClick={async () => {
              if (confirm('Are you sure you want to archive this lead?')) {
                await archiveLeadAction(leadId);
                loadLead();
              }
            }} variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600">Archive</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Data */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Students & Requirements</CardTitle></CardHeader>
            <CardContent>
              {lead.students?.length > 0 ? (
                <div className="space-y-4">
                  {lead.students.map((student: any) => (
                    <div key={student.id} className="p-4 border border-slate-100 rounded-md bg-slate-50">
                      <p className="font-semibold">{student.firstName} {student.lastName}</p>
                      {student.requirements?.map((req: any) => (
                        <div key={req.id} className="mt-2 text-sm text-slate-600 flex items-center gap-2">
                          <Badge variant="info">{req.subject?.name}</Badge>
                          <Badge variant="info">{req.grade?.name}</Badge>
                          <Badge variant="info">{req.curriculum?.name}</Badge>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No students added yet.</p>
              )}
            </CardContent>
          </Card>

          <SalesNotes leadId={leadId} initialNotes={lead.salesNotes} />
          <MarketingAttributionCard lead={lead} />
        </div>

        {/* RIGHT COLUMN: Operations */}
        <div className="space-y-6">
          <FollowUpPreview leadId={leadId} onAction={loadLead} />

          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto pr-2">
                <Timeline>
                  {(() => {
                    const events: any[] = [];
                    lead.statusHistory?.forEach((sh: any) => {
                      events.push({
                        type: 'STATUS',
                        date: new Date(sh.changedAt),
                        title: `Status changed to ${sh.newStatus}`,
                        description: sh.reason ? `"${sh.reason}"` : null,
                        color: 'bg-blue-500'
                      });
                    });
                    lead.assignmentHistory?.forEach((ah: any) => {
                      events.push({
                        type: 'ASSIGNMENT',
                        date: new Date(ah.assignedAt),
                        title: `Assigned to ${ah.newOwnerUserId || 'Unassigned'}`,
                        color: 'bg-purple-500'
                      });
                    });
                    lead.followUps?.forEach((fu: any) => {
                      events.push({
                        type: 'FOLLOW_UP_SCHEDULED',
                        date: new Date(fu.createdAt),
                        title: `Follow-up Scheduled`,
                        description: `Scheduled for ${new Date(fu.scheduledAt).toLocaleString()}${fu.remarks ? ` - "${fu.remarks}"` : ''}`,
                        color: 'bg-orange-400'
                      });
                      if (fu.status === 'COMPLETED') {
                        events.push({
                          type: 'FOLLOW_UP_COMPLETED',
                          date: new Date(fu.completedAt || fu.updatedAt),
                          title: `Follow-up Completed (${fu.classification || 'No classification'})`,
                          description: fu.completedRemarks ? `"${fu.completedRemarks}"` : null,
                          color: 'bg-green-500'
                        });
                      }
                    });

                    return events.sort((a, b) => b.date.getTime() - a.date.getTime()).map((ev, i) => (
                      <div key={i} className="mb-4 relative">
                        <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${ev.color}`} />
                        <p className="text-sm font-medium">{ev.title}</p>
                        <p className="text-xs text-slate-500">{ev.date.toLocaleString()}</p>
                        {ev.description && <p className="text-xs text-slate-600 mt-1 italic">{ev.description}</p>}
                      </div>
                    ));
                  })()}
                </Timeline>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isStatusOpen && <LeadStatusChangeDialog leadId={leadId} currentStatus={lead.status} isOpen={isStatusOpen} onClose={() => setIsStatusOpen(false)} onSuccess={loadLead} />}
      {isDemoOpen && <BookDemoDialog lead={lead} isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} onSuccess={loadLead} />}
      {isReassignOpen && <ReassignDialog leadId={leadId} isOpen={isReassignOpen} onClose={() => setIsReassignOpen(false)} onSuccess={loadLead} />}
    </div>
  );
}
