const fs = require('fs');
const path = require('path');

// 1. Leads Page
const leadsPage = `
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getTutorLeadsAction } from "@/app/(app)/tutor-hr/actions";
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
      
      const res = await getTutorLeadsAction(params.toString());
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

      <div className="bg-white p-4 border rounded-md flex flex-col md:flex-row gap-4 shadow-sm">
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

      <div className="bg-white border rounded-md overflow-hidden shadow-sm">
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
fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/leads/page.tsx', leadsPage.trim());

// 2. New Lead Page
const newPage = `
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTutorLeadAction } from "@/app/(app)/tutor-hr/actions";
import { Button } from "@/components/ui/Button";

export default function NewLeadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    totalTeachingExperience: 0,
    offlineTeachingExperience: 0,
    expectedHourlyRate: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createTutorLeadAction(formData);
      router.push('/tutor-hr/leads/' + res.id);
    } catch (err: any) {
      alert("Error adding lead: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-md border shadow-sm mt-6">
      <h2 className="text-2xl font-bold mb-6">Add New Tutor Lead</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">First Name *</label>
            <input 
              required
              type="text" 
              className="w-full border p-2 rounded" 
              value={formData.firstName}
              onChange={e => setFormData({...formData, firstName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Last Name</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded" 
              value={formData.lastName}
              onChange={e => setFormData({...formData, lastName: e.target.value})}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input 
              required
              type="email" 
              className="w-full border p-2 rounded" 
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input 
              type="tel" 
              className="w-full border p-2 rounded" 
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Total Exp (Yrs)</label>
            <input 
              type="number" 
              min="0"
              className="w-full border p-2 rounded" 
              value={formData.totalTeachingExperience}
              onChange={e => setFormData({...formData, totalTeachingExperience: parseInt(e.target.value) || 0})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Offline Exp (Yrs)</label>
            <input 
              type="number" 
              min="0"
              className="w-full border p-2 rounded" 
              value={formData.offlineTeachingExperience}
              onChange={e => setFormData({...formData, offlineTeachingExperience: parseInt(e.target.value) || 0})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expected Rate (/hr)</label>
            <input 
              type="number" 
              min="0"
              className="w-full border p-2 rounded" 
              value={formData.expectedHourlyRate}
              onChange={e => setFormData({...formData, expectedHourlyRate: parseInt(e.target.value) || 0})}
            />
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add Tutor Lead"}
          </Button>
        </div>
      </form>
    </div>
  );
}
`;
fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/leads/new/page.tsx', newPage.trim());

// 3. Detail Page
const detailPage = `
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getTutorLeadAction, updateTutorLeadStageAction, approveTutorLeadAction, getDepartmentsAction, getRolesAction } from "@/app/(app)/tutor-hr/actions";
import { Button } from "@/components/ui/Button";

export default function LeadDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function load() {
      try {
        const res = await getTutorLeadAction(id);
        setLead(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleApprove = async () => {
    try {
      if (!confirm("Are you sure you want to approve this candidate and convert them to a Tutor?")) return;
      
      const pwd = prompt("Enter an initial password for the candidate's account:", "Welcome123!");
      if (!pwd) return;

      const deptRes = await getDepartmentsAction();
      const roleRes = await getRolesAction();
      const tutorRole = (roleRes.items || []).find((r:any) => r.code === 'TUTOR');
      const tutorDept = (deptRes.items || []).find((d:any) => d.code === 'ACADEMICS');
      
      if (!tutorRole || !tutorDept) {
        alert("Could not find TUTOR role or ACADEMICS department. Cannot convert.");
        return;
      }

      await approveTutorLeadAction(id, {
        password: pwd,
        roleId: tutorRole.id,
        departmentId: tutorDept.id
      });
      alert("Successfully converted to Tutor Profile!");
      router.push('/tutor-hr/leads');
    } catch (err: any) {
      alert("Error approving lead: " + err.message);
    }
  };

  const handleChangeStage = async (stage: string) => {
    try {
      await updateTutorLeadStageAction(id, stage);
      const res = await getTutorLeadAction(id);
      setLead(res);
    } catch (err: any) {
      alert("Error changing stage: " + err.message);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading lead details...</div>;
  if (!lead) return <div className="p-8 text-center text-red-500">Lead not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold">{lead.firstName} {lead.lastName}</h2>
          <p className="text-gray-600">{lead.businessId} • {lead.email} • {lead.phone}</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="border p-2 rounded text-sm bg-white shadow-sm"
            value={lead.currentStage}
            onChange={(e) => handleChangeStage(e.target.value)}
          >
            <option value="LEAD">LEAD</option>
            <option value="DETAILS_SHARED">DETAILS_SHARED</option>
            <option value="CV_SHARED">CV_SHARED</option>
            <option value="DEMO">DEMO</option>
            <option value="TRAINING">TRAINING</option>
            <option value="READY_FOR_ASSIGNMENT">READY_FOR_ASSIGNMENT</option>
            <option value="NOT_INTERESTED">NOT_INTERESTED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          {lead.currentStage === 'READY_FOR_ASSIGNMENT' && (
            <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700 shadow-sm">
              Approve & Convert
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4 border-b">
        {["overview", "interactions", "training"].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={\`py-2 px-4 border-b-2 font-medium capitalize \${activeTab === tab ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}\`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="bg-white p-6 rounded-md border grid grid-cols-2 gap-6 shadow-sm">
          <div>
            <h3 className="font-semibold mb-2">Experience</h3>
            <p className="text-sm">Total: {lead.totalTeachingExperience || 0} years</p>
            <p className="text-sm">Offline: {lead.offlineTeachingExperience || 0} years</p>
            <p className="text-sm">Online: {lead.onlineTeachingExperience || 0} years</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Subject Capabilities</h3>
            <div className="flex flex-wrap gap-2">
              {lead.subjects?.map((s:any) => (
                 <span key={s.subjectId} className="px-2 py-1 bg-gray-100 text-xs rounded">{s.subject?.name}</span>
              ))}
            </div>
            <h3 className="font-semibold mt-4 mb-2">Grade Capabilities</h3>
            <div className="flex flex-wrap gap-2">
              {lead.grades?.map((g:any) => (
                 <span key={g.gradeId} className="px-2 py-1 bg-gray-100 text-xs rounded">{g.grade?.name}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'interactions' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-md border shadow-sm">
            <h3 className="font-semibold mb-4">Calls</h3>
            {lead.calls?.map((c:any) => (
              <div key={c.id} className="text-sm border-b pb-2 mb-2">
                <p>{c.remark}</p>
                <p className="text-xs text-gray-500">By {c.caller?.email} on {new Date(c.calledAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="bg-white p-6 rounded-md border shadow-sm">
            <h3 className="font-semibold mb-4">Demos</h3>
            {lead.demos?.map((d:any) => (
              <div key={d.id} className="text-sm border-b pb-2 mb-2">
                <p><strong>{d.isLiveDemo ? "Live Demo" : "Recorded Demo"}</strong> - {d.remarks}</p>
                <p className="text-xs text-gray-500">Recorded by {d.recordedBy?.email} on {new Date(d.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'training' && (
        <div className="bg-white p-6 rounded-md border shadow-sm">
          <h3 className="font-semibold mb-4 text-orange-600">HR Managed Training Sessions</h3>
          <p className="text-sm text-gray-600 mb-4">Candidates do not have accounts during this phase. HR is responsible for evaluating tasks and marking attendance manually.</p>
          
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Attendance</th>
                <th className="px-4 py-2">Task Status</th>
                <th className="px-4 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lead.trainingSessions?.map((t:any) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">{new Date(t.sessionDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{t.startTime ? new Date(t.startTime).toLocaleTimeString() : '-'}</td>
                  <td className="px-4 py-2">{t.attendanceStatus}</td>
                  <td className="px-4 py-2">{t.taskStatus}</td>
                  <td className="px-4 py-2">{t.remarks}</td>
                </tr>
              ))}
              {(!lead.trainingSessions || lead.trainingSessions.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-500">No training sessions recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
`;
fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/leads/[id]/page.tsx', detailPage.trim());

// 4. Settings Page
const settingsPage = `
"use client";

import { useEffect, useState } from "react";
import { getMotherTonguesAction } from "@/app/(app)/tutor-hr/actions";

export default function SettingsPage() {
  const [motherTongues, setMotherTongues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await getMotherTonguesAction();
        setMotherTongues(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <section className="bg-white p-6 border rounded-md shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Mother Tongues</h3>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {motherTongues.map((m: any) => (
              <tr key={m.id}>
                <td className="px-4 py-2">{m.name}</td>
                <td className="px-4 py-2">
                  <span className={\`px-2 py-1 text-xs rounded-full \${m.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}\`}>
                    {m.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
`;
fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/settings/page.tsx', settingsPage.trim());

// 5. Cleanup the api.ts which is no longer needed
if (fs.existsSync('apps/web/src/app/(app)/tutor-hr/api.ts')) {
  fs.unlinkSync('apps/web/src/app/(app)/tutor-hr/api.ts');
}

console.log('Migrated all pages to Server Actions!');
