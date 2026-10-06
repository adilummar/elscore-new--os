"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, UserCheck } from "lucide-react";
import { getTutorLeadsAction } from "@/app/(app)/tutor-hr/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stage, setStage] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (stage) params.append('stage', stage);
      
      const res = await getTutorLeadsAction(params.toString());
      setLeads(res?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, stage]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tutor Leads</h1>
          <p className="text-slate-500 text-sm mt-1">Manage and track your incoming tutor candidates.</p>
        </div>
        <Link href="/tutor-hr/leads/new">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Tutor Lead
          </Button>
        </Link>
      </div>

      <Card className="p-4 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search by name, email, phone or ID..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select className="w-full md:w-48" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All Stages</option>
            <option value="LEAD">Lead</option>
            <option value="DETAILS_SHARED">Details Shared</option>
            <option value="CV_SHARED">CV Shared</option>
            <option value="DEMO">Demo</option>
            <option value="TRAINING">Training</option>
            <option value="READY_FOR_ASSIGNMENT">Ready for Assignment</option>
            <option value="NOT_INTERESTED">Not Interested</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email / Phone</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                  Loading leads...
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                  No leads found matching your criteria.
                </TableCell>
              </TableRow>
            ) : leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium text-slate-600">{lead.businessId}</TableCell>
                <TableCell className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-slate-900">{lead.email}</span>
                    <span className="text-slate-500 text-xs">{lead.phone}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className="bg-brand-50 text-brand-700 hover:bg-brand-100 border-none">
                    {lead.currentStage}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/tutor-hr/leads/${lead.id}`}>
                    <Button variant="outline" size="sm">
                      View Profile
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}