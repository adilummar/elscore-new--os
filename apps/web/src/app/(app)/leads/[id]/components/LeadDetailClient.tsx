"use client";

import * as React from 'react';
import { getLeadAction, archiveLeadAction, reopenLeadAction } from '../../actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/components/providers/AuthProvider';
import { User, Phone, Clock, FileText, CheckCircle, Calendar, Users, DollarSign, Activity, AlertCircle } from 'lucide-react';
import { LeadStatusChangeDialog } from './LeadStatusChangeDialog';
import { ReassignDialog } from './ReassignDialog';
import { BookDemoDialog } from './BookDemoDialog';
import { FollowUpManager } from './FollowUpManager';
import { SalesNotes } from './SalesNotes';
import { MarketingAttributionCard } from './MarketingAttributionCard';
import { UnifiedTimeline } from './UnifiedTimeline';
import { FinanceTab } from './FinanceTab';
import { DemosTab } from './DemosTab';
import { StudentWorkspace } from './StudentWorkspace';
import { EditLeadDialog } from './EditLeadDialog';

type TabId = 'students' | 'followups' | 'demos' | 'marketing' | 'finance' | 'notes' | 'history';

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

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'students', label: 'Students', icon: Users },
    { id: 'followups', label: 'Follow-ups', icon: Clock },
    { id: 'demos', label: 'Demos', icon: Calendar },
    { id: 'marketing', label: 'Marketing', icon: Activity },
    { id: 'finance', label: 'Finance', icon: DollarSign },
    { id: 'notes', label: 'Sales Notes', icon: FileText },
    { id: 'history', label: 'Timeline', icon: CheckCircle },
  ];

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
          <div className="flex flex-wrap gap-4 text-sm text-slate-500 mt-2">
            <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {lead.primaryPhone}</span>
            {lead.whatsappNumber && <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> WA: {lead.whatsappNumber}</span>}
            <span className="flex items-center gap-1"><User className="w-4 h-4" /> Source: {lead.source}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Created: {new Date(lead.createdAt).toLocaleDateString()}</span>
            <span className="flex items-center gap-1"><User className="w-4 h-4" /> Owner: {lead.assignedToUser?.firstName ? `${lead.assignedToUser.firstName} ${lead.assignedToUser.lastName}` : lead.assignedToUserId || 'Unassigned'}</span>
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
            <DemosTab lead={lead} />
          )}
          {activeTab === 'marketing' && (
            <MarketingAttributionCard lead={lead} />
          )}
          {activeTab === 'finance' && (
            <FinanceTab lead={lead} />
          )}
          {activeTab === 'notes' && (
            <SalesNotes leadId={leadId} initialNotes={lead.salesNotes} />
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
