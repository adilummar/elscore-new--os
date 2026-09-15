"use client";

import * as React from 'react';
import { getLeadsAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { Search, Plus } from 'lucide-react';
import { CreateLeadDialog } from './CreateLeadDialog';

export function LeadList() {
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [source, setSource] = React.useState('');
  
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  
  const { hasPermission } = usePermissions();
  const router = useRouter();

  const loadLeads = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (source) params.append('source', source);
      
      const res = await getLeadsAction(params.toString());
      setLeads(res.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, source]);

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

      <Card className="p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search by name or phone..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="INTERESTED">Interested</option>
        </Select>
        <Select className="w-full sm:w-48" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All Sources</option>
          <option value="META_FACEBOOK">Facebook</option>
          <option value="GOOGLE">Google</option>
          <option value="REFERRAL">Referral</option>
        </Select>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parent Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-red-500">{error}</TableCell></TableRow>
              ) : leads.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No leads match your search.</TableCell></TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow 
                    key={lead.id} 
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <TableCell className="font-medium">
                      {lead.firstName} {lead.lastName}
                    </TableCell>
                    <TableCell>{lead.primaryPhone}</TableCell>
                    <TableCell><Badge>{lead.status}</Badge></TableCell>
                    <TableCell><span className="text-sm text-slate-500">{lead.source}</span></TableCell>
                    <TableCell><span className="text-sm text-slate-500">{new Date(lead.createdAt).toLocaleDateString()}</span></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CreateLeadDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSuccess={loadLeads} />
    </div>
  );
}
