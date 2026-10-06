const fs = require('fs');
const content = `
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { clientApi as api } from "@/app/(app)/tutor-hr/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
      
      const res = await api('/tutor-hr/leads?' + params.toString());
      setLeads(res.items || []);
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Tutor Leads</h2>
          <p className="text-slate-500 text-sm mt-1">Manage and track your incoming tutor candidates.</p>
        </div>
        <Link href="/tutor-hr/leads/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Lead
          </Button>
        </Link>
      </div>

      <div className="bg-white p-4 border rounded-md flex flex-col md:flex-row gap-4">
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

      <div className="bg-white border rounded-md overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Loading leads...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No leads found matching your criteria.
                </td>
              </tr>
            ) : leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 font-medium">{lead.businessId}</td>
                <td className="px-4 py-3 font-medium">{lead.firstName} {lead.lastName}</td>
                <td className="px-4 py-3 text-gray-600">{lead.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">
                    {lead.currentStage}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={\`/tutor-hr/leads/\${lead.id}\`} className="text-primary hover:underline font-medium">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;
fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/leads/page.tsx', content.trim());
console.log('Fixed leads page');
