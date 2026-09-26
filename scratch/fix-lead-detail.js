const fs = require('fs');
const content = `
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clientApi as api } from "@/app/(app)/tutor-hr/api";
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
        const res = await api('/tutor-hr/leads/' + id);
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

      const deptRes = await api('/departments');
      const roleRes = await api('/roles');
      const tutorRole = (roleRes.items || []).find((r:any) => r.code === 'TUTOR');
      const tutorDept = (deptRes.items || []).find((d:any) => d.code === 'ACADEMICS');
      
      if (!tutorRole || !tutorDept) {
        alert("Could not find TUTOR role or ACADEMICS department. Cannot convert.");
        return;
      }

      await api('/tutor-hr/reviews/' + id + '/approve', {
        method: 'POST',
        body: JSON.stringify({
          password: pwd,
          roleId: tutorRole.id,
          departmentId: tutorDept.id
        })
      });
      alert("Successfully converted to Tutor Profile!");
      router.push('/tutor-hr/leads');
    } catch (err: any) {
      alert("Error approving lead: " + err.message);
    }
  };

  const handleChangeStage = async (stage: string) => {
    try {
      await api('/tutor-hr/leads/' + id + '/stage', { 
        method: 'POST',
        body: JSON.stringify({ stage })
      });
      const res = await api('/tutor-hr/leads/' + id);
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
            className="border p-2 rounded text-sm bg-white"
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
            <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
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
            className={\`py-2 px-4 border-b-2 font-medium capitalize \${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}\`}
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
fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/leads/[id]/page.tsx', content.trim());
console.log('Fixed lead detail page');
