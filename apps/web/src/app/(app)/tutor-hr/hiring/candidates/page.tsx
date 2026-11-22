"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getSources, listCandidates } from '../actions';
import { DECISIONS, STAGES, fmtDate } from '../constants';
import { DecisionBadge, Empty, ErrorNote, PageHeader, SkeletonRows, StageBadge } from '../_components/kit';

const PAGE_SIZE = 25;

export default function CandidatesPage() {
  const { hasPermission } = usePermissions();
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ page: 1, totalPages: 1, total: 0 });
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [decision, setDecision] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { getSources().then((r) => r.ok && setSources(r.data)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    const [sortBy, sortDir] = sort.split(':');
    p.set('sortBy', sortBy); p.set('sortDir', sortDir);
    if (q) p.set('search', q);
    if (stage) p.set('stage', stage);
    if (decision) p.set('decision', decision);
    if (sourceId) p.set('sourceId', sourceId);
    if (mine) p.set('mine', 'true');
    const r = await listCandidates(p.toString());
    if (r.ok) { setRows(r.data.data); setMeta(r.data.meta); setError(null); } else setError(r.message);
    setLoading(false);
  }, [page, q, stage, decision, sourceId, mine, sort]);
  useEffect(() => { load(); }, [load]);

  const reset = (fn: () => void) => { fn(); setPage(1); };
  const filtered = !!(q || stage || decision || sourceId || mine);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Candidates"
        subtitle={`${meta.total ?? 0} candidate${meta.total === 1 ? '' : 's'}`}
        actions={hasPermission('tutor_lead.create') && (
          <Link href="/tutor-hr/hiring/candidates/new"><Button><Plus className="w-4 h-4 mr-1.5" />Register lead</Button></Link>
        )}
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
            <Input aria-label="Search candidates" placeholder="Name, phone or candidate ID" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Stage" value={stage} onChange={(e) => reset(() => setStage(e.target.value))}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select aria-label="Decision" value={decision} onChange={(e) => reset(() => setDecision(e.target.value))}>
            <option value="">All decisions</option>
            {DECISIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select aria-label="Source" value={sourceId} onChange={(e) => reset(() => setSourceId(e.target.value))}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => reset(() => setSort(e.target.value))}>
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="updatedAt:desc">Recently updated</option>
            <option value="businessId:asc">Candidate ID</option>
          </Select>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={mine} onChange={(e) => reset(() => setMine(e.target.checked))} />
          Only my candidates
        </label>
      </Card>

      <ErrorNote message={error} />

      <Card>
        {loading && rows.length === 0 ? <SkeletonRows rows={6} /> : rows.length === 0 ? (
          <Empty
            title={filtered ? 'No candidates match these filters' : 'No candidates yet'}
            hint={filtered ? 'Try clearing a filter or the search.' : 'Register the first lead to start the pipeline.'}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id} className={loading ? 'opacity-60' : ''}>
                      <TableCell>
                        <Link href={`/tutor-hr/hiring/candidates/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                          {c.name ?? 'Unnamed lead'}
                        </Link>
                        <p className="text-xs text-slate-500">{c.candidateId}</p>
                      </TableCell>
                      <TableCell className="tabular-nums">{c.phone}</TableCell>
                      <TableCell><StageBadge stage={c.stage} /></TableCell>
                      <TableCell><DecisionBadge decision={c.decision} /></TableCell>
                      <TableCell>
                        {c.firstSource ?? '—'}
                        {c.enquiryCount > 1 && <span className="ml-1 text-xs text-slate-500">+{c.enquiryCount - 1} more enquir{c.enquiryCount - 1 === 1 ? 'y' : 'ies'}</span>}
                      </TableCell>
                      <TableCell className="text-slate-600">{c.manager?.email ?? '—'}</TableCell>
                      <TableCell className="text-slate-600 whitespace-nowrap">{fmtDate(c.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-slate-100">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/tutor-hr/hiring/candidates/${c.id}`} className="block p-4 active:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{c.name ?? 'Unnamed lead'}</p>
                        <p className="text-xs text-slate-500">{c.candidateId} · {c.phone}</p>
                      </div>
                      <StageBadge stage={c.stage} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <DecisionBadge decision={c.decision} />
                      <span>{c.firstSource ?? 'No source'}</span>
                      <span>{fmtDate(c.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
              <span>Page {meta.page} of {Math.max(meta.totalPages, 1)}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
