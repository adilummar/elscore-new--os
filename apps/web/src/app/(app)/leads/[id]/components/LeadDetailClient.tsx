"use client";

import * as React from 'react';
import { getLeadAction, archiveLeadAction, reopenLeadAction } from '../../actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePermissions, useAuth } from '@/components/providers/AuthProvider';
import { User, Phone, Clock, FileText, CheckCircle, Calendar, Users, DollarSign, Activity, AlertCircle, MessageSquare } from 'lucide-react';
import { LeadStatusChangeDialog } from './LeadStatusChangeDialog';
import { ReassignDialog } from './ReassignDialog';
import { BookDemoDialog } from './BookDemoDialog';
import { FollowUpManager } from './FollowUpManager';
import { SalesNotes } from './SalesNotes';
import { UnifiedTimeline } from './UnifiedTimeline';
import { FinanceTab } from './FinanceTab';
import { DemosTab } from './DemosTab';
import { StudentWorkspace } from './StudentWorkspace';
import { EditLeadDialog } from './EditLeadDialog';
import { LeadDistributionHistory } from './LeadDistributionHistory';

type TabId = 'students' | 'followups' | 'demos' | 'finance' | 'notes' | 'history' | 'assignments';

export function LeadDetailClient({ leadId }: { leadId: string }) {
  const [lead, setLead] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabId>('students');
  
  const [isStatusOpen, setIsStatusOpen] = React.useState(false);
  const [isDemoOpen, setIsDemoOpen] = React.useState(false);
  const [isReassignOpen, setIsReassignOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  const { hasPermission } = usePermissions();
  const { effectiveUser } = useAuth();

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

  let tabs: { id: TabId | 'assignments'; label: string; icon: any }[] = [
    { id: 'students', label: 'Students', icon: Users },
    { id: 'followups', label: 'Follow-ups', icon: Clock },
    { id: 'demos', label: 'Demos', icon: Calendar },
    { id: 'finance', label: 'Finance', icon: DollarSign },
    { id: 'notes', label: 'Sales Notes', icon: FileText },
    { id: 'assignments', label: 'Assignment History', icon: User },
    { id: 'history', label: 'Timeline', icon: CheckCircle },
  ];

  if (effectiveUser?.roles?.includes('SALES_COUNSELLOR')) {
    tabs = tabs.filter(t => t.id !== 'assignments');
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-slate-900">{lead.firstName} {lead.lastName}</h1>
            <Badge variant="info">{lead.status}</Badge>
            {lead.isArchived && <Badge variant="warning">ARCHIVED</Badge>}
            {hasPermission('lead.update') && (
              <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>Edit</Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-2">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
              <Phone className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-slate-700">{lead.primaryPhone}</span>
              <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200">
                <a href={`tel:${lead.primaryPhone}`} className="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors" title="Call">
                  <Phone className="w-4 h-4" />
                </a>
              </div>
            </div>
            
            {lead.whatsappNumber && (
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-700">{lead.whatsappNumber}</span>
                <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200">
                  <a href={`https://wa.me/${lead.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="WhatsApp">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                  </a>
                </div>
              </div>
            )}
            
            <span className="flex items-center gap-1"><User className="w-4 h-4" /> Source: {lead.source}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Created: {new Date(lead.createdAt).toLocaleDateString()}</span>
            <span className="flex items-center gap-1"><User className="w-4 h-4" /> Owner: {lead.assignedToUser?.employee?.firstName ? `${lead.assignedToUser.employee.firstName} ${lead.assignedToUser.employee.lastName}` : lead.assignedToUser?.email || lead.assignedToUserId || 'Unassigned'}</span>
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
          {hasPermission('lead.reopen') && (lead.status === 'LOST' || lead.status === 'NOT_INTERESTED') && (
             <Button onClick={async () => {
               if (confirm('Are you sure you want to reopen this lead?')) {
                 await reopenLeadAction(leadId);
                 loadLead();
               }
             }} variant="outline" className="text-blue-500 border-blue-200 hover:bg-blue-50 hover:text-blue-600">Reopen Lead</Button>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/50">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive 
                    ? 'border-brand-500 text-brand-700 bg-white' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-brand-500' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === 'students' && (
            <StudentWorkspace lead={lead} onUpdate={loadLead} />
          )}
          {activeTab === 'followups' && (
            <FollowUpManager lead={lead} onUpdate={loadLead} />
          )}
          {activeTab === 'demos' && (
            <DemosTab lead={lead} onUpdate={loadLead} />
          )}
          {activeTab === 'finance' && (
            <FinanceTab lead={lead} />
          )}
          {activeTab === 'notes' && (
            <SalesNotes leadId={leadId} initialNotes={lead.salesNotes} />
          )}
          {activeTab === 'assignments' && (
            <LeadDistributionHistory leadId={leadId} />
          )}
          {activeTab === 'history' && (
            <UnifiedTimeline leadId={leadId} />
          )}
        </div>
      </div>

      {isStatusOpen && <LeadStatusChangeDialog leadId={leadId} currentStatus={lead.status} isOpen={isStatusOpen} onClose={() => setIsStatusOpen(false)} onSuccess={loadLead} />}
      {isDemoOpen && <BookDemoDialog lead={lead} isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} onSuccess={loadLead} />}
      {isReassignOpen && <ReassignDialog leadId={leadId} isOpen={isReassignOpen} onClose={() => setIsReassignOpen(false)} onSuccess={loadLead} />}
      {isEditOpen && <EditLeadDialog lead={lead} isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} onSuccess={loadLead} />}
    </div>
  );
}
