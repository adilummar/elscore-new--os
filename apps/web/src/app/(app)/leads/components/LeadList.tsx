"use client";

import * as React from 'react';
import { getLeadsAction, getEmployeesAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { Search, Plus, Calendar, User, ChevronRight } from 'lucide-react';
import { CreateLeadDialog } from './CreateLeadDialog';

export function LeadList() {
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [source, setSource] = React.useState('');
  const [classification, setClassification] = React.useState('');
  const [ownerId, setOwnerId] = React.useState('');
  const [followUpState, setFollowUpState] = React.useState('');
  
  const [employees, setEmployees] = React.useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  
  const { hasPermission } = usePermissions();
  const router = useRouter();

  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadEmployees() {
      try {
        const res = await getEmployeesAction();
        const activeEmployees = (res.data || []).filter((emp: any) => {
          if (emp.employmentStatus !== 'ACTIVE') return false;
          return emp.user?.userRoles?.some((ur: any) => 
            ur.role?.code === 'SALES_HEAD' || ur.role?.code === 'SALES_COUNSELLOR'
          );
        });
        setEmployees(activeEmployees);
      } catch (err) {
        console.error("Failed to load employees", err);
      }
    }
    loadEmployees();
  }, []);

  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadLeads = React.useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (status) params.append('status', status);
      if (source) params.append('source', source);
      if (classification) params.append('classification', classification);
      if (ownerId) params.append('assignedToUserId', ownerId);
      if (followUpState) params.append('followUpState', followUpState);
      if (cursor) params.append('cursor', cursor);
      
      const res = await getLeadsAction(params.toString());
      if (cursor) {
        setLeads(prev => [...prev, ...(res?.data || [])]);
      } else {
        setLeads(res?.data || []);
      }
      setNextCursor(res?.pagination?.nextCursor || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, source, classification, ownerId, followUpState]);

  React.useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leads</h1>
          <p className="text-slate-500 text-sm mt-1">Manage and track your CRM leads.</p>
        </div>
        {hasPermission('lead.create') && (
          <Button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Lead
          </Button>
        )}
      </div>

      <Card className="p-4 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search by name or phone..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select className="w-full md:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="INTERESTED">Interested</option>
            <option value="DEMO_BOOKED">Demo Booked</option>
            <option value="DEMO_COMPLETED">Demo Completed</option>
            <option value="NEGOTIATION">Negotiation</option>
            <option value="NURTURE">Nurture</option>
            <option value="ENROLLED">Enrolled</option>
            <option value="NOT_INTERESTED">Not Interested</option>
            <option value="NO_RESPONSE">No Response</option>
            <option value="LOST">Lost</option>
            <option value="JUNK">Junk</option>
            <option value="PAID">Paid</option>
          </Select>
          <Select className="w-full md:w-40" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All Sources</option>
            <option value="META_FACEBOOK">Facebook</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="GOOGLE">Google</option>
            <option value="WEBSITE">Website</option>
            <option value="REFERRAL">Referral</option>
            <option value="DIRECT">Direct</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <div className="flex flex-col md:flex-row gap-4">
          <Select className="w-full md:w-48" value={classification} onChange={(e) => setClassification(e.target.value)}>
            <option value="">All Classifications</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="NON_QUALIFIED">Non-Qualified</option>
            <option value="NO_RESPONSE">No Response</option>
            <option value="JUNK">Junk</option>
          </Select>
          <Select className="w-full md:w-48" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">All Owners</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.userId}>{emp.firstName} {emp.lastName}</option>
            ))}
          </Select>
          <Select className="w-full md:w-48" value={followUpState} onChange={(e) => setFollowUpState(e.target.value)}>
            <option value="">All Follow-Ups</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="OVERDUE">Overdue</option>
            <option value="NONE">None</option>
          </Select>
        </div>
      </Card>

      <div className="md:hidden space-y-4">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No leads match your search.</div>
        ) : (
          leads.map((lead) => {
            const isOverdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
            return (
            <Card key={lead.id} className={`p-4 flex flex-col gap-3 cursor-pointer ${isOverdue ? 'bg-red-50 border-red-100 hover:bg-red-100' : 'hover:bg-slate-50'}`} onClick={() => router.push(`/leads/${lead.id}`)}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-slate-500">{lead.primaryPhone}</p>
                    <div className="flex items-center gap-1 opacity-80">
                      <a href={`tel:${lead.primaryPhone}`} onClick={e => e.stopPropagation()} className="p-1 hover:bg-brand-50 hover:text-brand-600 rounded" title="Call">
                        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </a>
                      {lead.whatsappNumber && (
                        <a href={`https://wa.me/${lead.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1 hover:bg-green-50 hover:text-green-600 rounded" title="WhatsApp">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <Badge>{lead.status}</Badge>
              </div>
              
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center text-sm text-slate-600 gap-2">
                  <User className="w-4 h-4" />
                  <span>{lead.assignedToUser?.employee?.firstName ? `${lead.assignedToUser.employee.firstName} ${lead.assignedToUser.employee.lastName}` : lead.assignedToUser?.email ? lead.assignedToUser.email : 'Unassigned'}</span>
                </div>
                {lead.nextFollowUpAt && (
                  <div className="flex items-center text-sm text-slate-600 gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Next Follow-up: {new Date(lead.nextFollowUpAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end mt-2 pt-2 border-t">
                <Button variant="ghost" size="sm" className="flex items-center gap-1 text-blue-600 hover:text-blue-700">
                  View Detail <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </Card>
            );
          })
        )}
      </div>

      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parent Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Next Follow-Up</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-red-500">{error}</TableCell></TableRow>
              ) : leads.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No leads match your search.</TableCell></TableRow>
              ) : (
                leads.map((lead) => {
                  const isOverdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
                  return (
                  <TableRow 
                    key={lead.id} 
                    className={`cursor-pointer ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <TableCell className="font-medium">
                      {lead.firstName} {lead.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{lead.primaryPhone}</span>
                        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                          <a href={`tel:${lead.primaryPhone}`} onClick={e => e.stopPropagation()} className="p-1 hover:bg-brand-50 hover:text-brand-600 rounded" title="Call">
                            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </a>
                          {lead.whatsappNumber && (
                            <a href={`https://wa.me/${lead.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1 hover:bg-green-50 hover:text-green-600 rounded" title="WhatsApp">
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge>{lead.status}</Badge></TableCell>
                    <TableCell><span className="text-sm text-slate-500">{lead.source}</span></TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-700">
                        {lead.assignedToUser?.employee?.firstName ? `${lead.assignedToUser.employee.firstName} ${lead.assignedToUser.employee.lastName}` : lead.assignedToUser?.email ? lead.assignedToUser.email : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-700">
                        {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleDateString() : '-'}
                      </span>
                    </TableCell>
                    <TableCell><span className="text-sm text-slate-500">{new Date(lead.createdAt).toLocaleDateString()}</span></TableCell>
                  </TableRow>
                );
              })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {nextCursor && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={() => loadLeads(nextCursor)} disabled={loading}>
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      <CreateLeadDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSuccess={loadLeads} />
    </div>
  );
}

