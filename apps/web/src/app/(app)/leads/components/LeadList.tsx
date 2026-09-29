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
import { Search, Plus, Calendar, User, ChevronRight, X } from 'lucide-react';
import { CreateLeadDialog } from './CreateLeadDialog';

// ─── helpers ──────────────────────────────────────────────────────────────────
function toISODate(d: Date) {
  return d.toISOString().split('T')[0]; // "YYYY-MM-DD"
}
function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function endOfDay(d: Date) {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}

const QUICK_FILTERS = [
  {
    label: 'Today',
    getRange: () => {
      const t = new Date();
      return { from: toISODate(t), to: toISODate(t) };
    },
  },
  {
    label: 'Yesterday',
    getRange: () => {
      const t = new Date(); t.setDate(t.getDate() - 1);
      return { from: toISODate(t), to: toISODate(t) };
    },
  },
  {
    label: 'This Week',
    getRange: () => {
      const now = new Date();
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { from: toISODate(mon), to: toISODate(now) };
    },
  },
  {
    label: 'This Month',
    getRange: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISODate(first), to: toISODate(now) };
    },
  },
];

// ── Cache for instant back navigation ───────────────────────────────────────
let cachedState: {
  leads: any[];
  search: string;
  status: string;
  source: string;
  classification: string;
  ownerId: string;
  followUpState: string;
  limit: number;
  dateFrom: string;
  dateTo: string;
  activeQuick: string | null;
  nextCursor: string | null;
  totalLoaded: number;
  scrollY: number;
} | null = null;

// ─── component ────────────────────────────────────────────────────────────────
export function LeadList() {
  const [leads, setLeads] = React.useState<any[]>(cachedState?.leads || []);
  const [loading, setLoading] = React.useState(!cachedState?.leads?.length);
  const [error, setError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState(cachedState?.search || '');
  const [debouncedSearch, setDebouncedSearch] = React.useState(cachedState?.search || '');
  const [status, setStatus] = React.useState(cachedState?.status || '');
  const [source, setSource] = React.useState(cachedState?.source || '');
  const [classification, setClassification] = React.useState(cachedState?.classification || '');
  const [ownerId, setOwnerId] = React.useState(cachedState?.ownerId || '');
  const [followUpState, setFollowUpState] = React.useState(cachedState?.followUpState || '');
  const [limit, setLimit] = React.useState(cachedState?.limit || 20);

  // Date filters
  const [dateFrom, setDateFrom] = React.useState(cachedState?.dateFrom || '');
  const [dateTo, setDateTo] = React.useState(cachedState?.dateTo || '');
  const [activeQuick, setActiveQuick] = React.useState<string | null>(cachedState?.activeQuick || null);

  const [employees, setEmployees] = React.useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const { hasPermission } = usePermissions();
  const router = useRouter();
  const [nextCursor, setNextCursor] = React.useState<string | null>(cachedState?.nextCursor || null);
  const [totalLoaded, setTotalLoaded] = React.useState(cachedState?.totalLoaded || 0);

  // Restore scroll position
  React.useEffect(() => {
    if (cachedState?.scrollY) {
      window.scrollTo(0, cachedState.scrollY);
    }
  }, []);

  // Update cache whenever state changes
  React.useEffect(() => {
    const handleScroll = () => {
      if (cachedState) {
        cachedState.scrollY = window.scrollY;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    cachedState = {
      leads, search, status, source, classification, ownerId, followUpState, limit,
      dateFrom, dateTo, activeQuick, nextCursor, totalLoaded,
      scrollY: cachedState?.scrollY || window.scrollY
    };
  }, [leads, search, status, source, classification, ownerId, followUpState, limit, dateFrom, dateTo, activeQuick, nextCursor, totalLoaded]);


  // ── Load employees ──────────────────────────────────────────────────────────
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

  // ── Debounce search ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  // ── Apply quick filter ──────────────────────────────────────────────────────
  function applyQuick(label: string, getRange: () => { from: string; to: string }) {
    if (activeQuick === label) {
      // Toggle off
      setActiveQuick(null);
      setDateFrom('');
      setDateTo('');
    } else {
      const { from, to } = getRange();
      setActiveQuick(label);
      setDateFrom(from);
      setDateTo(to);
    }
  }

  function clearDates() {
    setActiveQuick(null);
    setDateFrom('');
    setDateTo('');
  }

  // ── Load leads ──────────────────────────────────────────────────────────────
  const loadLeads = React.useCallback(async (cursor?: string) => {
    if (!cursor && !leads.length) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (status) params.append('status', status);
      if (source) params.append('source', source);
      if (classification) params.append('classification', classification);
      if (ownerId) params.append('assignedToUserId', ownerId);
      if (followUpState) params.append('followUpState', followUpState);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      params.append('limit', String(limit));
      if (cursor) params.append('cursor', cursor);

      const res = await getLeadsAction(params.toString());
      const newData = res?.data || [];
      if (cursor) {
        setLeads(prev => {
          const updated = [...prev, ...newData];
          setTotalLoaded(updated.length);
          return updated;
        });
      } else {
        setLeads(newData);
        setTotalLoaded(newData.length);
      }
      setNextCursor(res?.pagination?.nextCursor || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, source, classification, ownerId, followUpState, dateFrom, dateTo, limit, leads.length]);


  React.useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function ownerName(lead: any) {
    const emp = lead.assignedToUser?.employee;
    if (emp?.firstName) return `${emp.firstName} ${emp.lastName}`;
    return lead.assignedToUser?.email ?? '-';
  }

  const hasDateFilter = dateFrom || dateTo;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leads</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage and track your CRM leads.
            {!loading && (
              <span className="ml-2 text-slate-400">
                Showing {totalLoaded}{nextCursor ? '+' : ''} lead{totalLoaded !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        {hasPermission('lead.create') && (
          <Button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Lead
          </Button>
        )}
      </div>

      {/* Filter Card */}
      <Card className="p-4 space-y-4">
        {/* Row 1: Search + Status + Source */}
        <div className="flex flex-col md:flex-row gap-3">
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
          <Select
            className="w-full md:w-32"
            value={String(limit)}
            onChange={(e) => { setLimit(Number(e.target.value)); }}
            title="Rows per page"
          >
            <option value="20">20 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </Select>
        </div>

        {/* Row 2: Classification + Owner + Follow-up */}
        <div className="flex flex-col md:flex-row gap-3">
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

        {/* Row 3: Date Filters */}
        <div className="border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-sm text-slate-500 shrink-0">Filter by date:</span>

            {/* Quick filter pills */}
            {QUICK_FILTERS.map(qf => (
              <button
                key={qf.label}
                onClick={() => applyQuick(qf.label, qf.getRange)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeQuick === qf.label
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-green-400 hover:text-green-700'
                }`}
              >
                {qf.label}
              </button>
            ))}

            {/* Custom range */}
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setActiveQuick(null); }}
                className="h-8 px-2 text-sm border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                title="From date"
              />
              <span className="text-slate-400 text-sm">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setActiveQuick(null); }}
                min={dateFrom || undefined}
                className="h-8 px-2 text-sm border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                title="To date"
              />
            </div>

            {/* Clear */}
            {hasDateFilter && (
              <button
                onClick={clearDates}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-500 hover:bg-red-50 border border-red-200 transition-colors"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {/* Active date label */}
          {hasDateFilter && (
            <p className="text-xs text-slate-400 mt-2 ml-6">
              Showing leads created
              {dateFrom && dateTo && dateFrom === dateTo
                ? ` on ${new Date(dateFrom).toLocaleDateString()}`
                : <>
                    {dateFrom && ` from ${new Date(dateFrom).toLocaleDateString()}`}
                    {dateTo && ` to ${new Date(dateTo).toLocaleDateString()}`}
                  </>
              }
            </p>
          )}
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {loading ? (
          // Mobile skeleton
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 animate-pulse">
                <div className="flex justify-between items-start mb-3">
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-28" />
                    <div className="h-3 bg-slate-100 rounded w-20" />
                  </div>
                  <div className="h-5 bg-slate-200 rounded-full w-14" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-24" />
                  <div className="h-3 bg-slate-100 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No leads match your filters.</div>
        ) : (
          leads.map((lead) => {
            const isOverdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
            return (
              <Card
                key={lead.id}
                className={`p-4 flex flex-col gap-3 cursor-pointer ${
                  isOverdue ? 'bg-red-50 border-red-100 hover:bg-red-100' : 'hover:bg-slate-50'
                }`}
                onClick={() => router.push(`/leads/${lead.id}`)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{lead.primaryPhone}</p>
                  </div>
                  <Badge>{lead.status}</Badge>
                </div>
                <div className="flex flex-col gap-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>{ownerName(lead)}</span>
                  </div>
                  {lead.nextFollowUpAt && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Follow-up: {new Date(lead.nextFollowUpAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  <span className="text-xs text-slate-400">
                    Created {new Date(lead.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-end border-t border-slate-100 pt-2">
                  <Button variant="ghost" size="sm" className="flex items-center gap-1 text-blue-600 hover:text-blue-700">
                    View <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-slate-700">Parent Name</TableHead>
              <TableHead className="font-semibold text-slate-700">Phone</TableHead>
              <TableHead className="font-semibold text-slate-700">Status</TableHead>
              <TableHead className="font-semibold text-slate-700">Source</TableHead>
              <TableHead className="font-semibold text-slate-700">Owner</TableHead>
              <TableHead className="font-semibold text-slate-700">Next Follow-Up</TableHead>
              <TableHead className="font-semibold text-slate-700">Created</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              // Desktop skeleton rows
              <>
                {Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell><div className="h-4 bg-slate-200 rounded w-28" /></TableCell>
                    <TableCell><div className="h-4 bg-slate-100 rounded w-24" /></TableCell>
                    <TableCell><div className="h-5 bg-slate-200 rounded-full w-16" /></TableCell>
                    <TableCell><div className="h-4 bg-slate-100 rounded w-20" /></TableCell>
                    <TableCell><div className="h-4 bg-slate-100 rounded w-20" /></TableCell>
                    <TableCell><div className="h-4 bg-slate-100 rounded w-16" /></TableCell>
                    <TableCell><div className="h-4 bg-slate-100 rounded w-16" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-red-500">{error}</TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  No leads match your filters.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => {
                const isOverdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
                return (
                  <TableRow
                    key={lead.id}
                    className={`cursor-pointer transition-colors ${
                      isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'
                    }`}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {lead.firstName} {lead.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700">{lead.primaryPhone}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                          <a
                            href={`tel:${lead.primaryPhone}`}
                            onClick={e => e.stopPropagation()}
                            className="p-1 hover:bg-blue-50 hover:text-blue-600 rounded"
                            title="Call"
                          >
                            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </a>
                          {lead.whatsappNumber && (
                            <a
                              href={`https://wa.me/${lead.whatsappNumber.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="p-1 hover:bg-green-50 hover:text-green-600 rounded"
                              title="WhatsApp"
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge>{lead.status}</Badge></TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500 capitalize">{lead.source?.replace(/_/g, ' ').toLowerCase()}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-700">{ownerName(lead)}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-700'}`}>
                        {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleDateString() : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination footer */}
      {leads.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1 py-3 border-t border-slate-100">
          <p className="text-sm text-slate-500 order-2 sm:order-1">
            Showing <span className="font-semibold text-slate-700">{totalLoaded}</span> lead{totalLoaded !== 1 ? 's' : ''}
            {nextCursor && <span className="text-slate-400"> — more available</span>}
          </p>

          <div className="flex items-center gap-3 order-1 sm:order-2">
            {nextCursor ? (
              <Button
                variant="outline"
                onClick={() => loadLeads(nextCursor)}
                disabled={loading}
                className="flex items-center gap-2 min-w-[140px] justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    Load More
                    <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">+{limit}</span>
                  </>
                )}
              </Button>
            ) : (
              <span className="text-sm text-slate-400 italic">All leads loaded</span>
            )}
          </div>
        </div>
      )}

      <CreateLeadDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSuccess={loadLeads} />
    </div>
  );
}
