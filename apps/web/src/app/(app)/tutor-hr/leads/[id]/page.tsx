"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, UserCheck, Star } from "lucide-react";
import { getTutorLeadAction, updateTutorLeadStageAction, approveTutorLeadAction, getDepartmentsAction, getRolesAction } from "@/app/(app)/tutor-hr/actions";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

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
      const tutorRole = (roleRes.data || []).find((r:any) => r.code === 'TUTOR');
      const tutorDept = (deptRes.data || []).find((d:any) => d.code === 'ACADEMICS');
      
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

  if (loading) return <div className="p-12 text-center text-slate-500 font-medium">Loading candidate profile...</div>;
  if (!lead) return <div className="p-12 text-center text-red-500 font-medium">Candidate not found</div>;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <Link href="/tutor-hr/leads" className="mt-1 text-slate-400 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{lead.firstName} {lead.lastName}</h1>
              <Badge className="bg-brand-50 text-brand-700 hover:bg-brand-100">{lead.businessId}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-slate-400" /> {lead.email}</span>
              <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-slate-400" /> {lead.phone || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-lg border shadow-sm">
          <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Pipeline Stage</span>
            <Select value={lead.currentStage} onChange={(e) => handleChangeStage(e.target.value)} className="min-w-[180px] font-medium border-none shadow-none focus:ring-0">
              <option value="LEAD">LEAD</option>
              <option value="DETAILS_SHARED">DETAILS_SHARED</option>
              <option value="CV_SHARED">CV_SHARED</option>
              <option value="DEMO">DEMO</option>
              <option value="TRAINING">TRAINING</option>
              <option value="READY_FOR_ASSIGNMENT">READY_FOR_ASSIGNMENT</option>
              <option value="NOT_INTERESTED">NOT_INTERESTED</option>
              <option value="REJECTED">REJECTED</option>
            </Select>
          </div>
          {lead.currentStage === 'READY_FOR_ASSIGNMENT' && (
            <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700 shadow-md flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Approve & Convert
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {["overview", "interactions", "training"].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 font-medium capitalize text-sm transition-colors border-b-2 ${activeTab === tab ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Professional Experience</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-slate-500">Total Teaching Experience</span>
                  <span className="font-semibold text-slate-900">{lead.totalTeachingExperience || 0} Years</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-slate-500">Offline Experience</span>
                  <span className="font-medium text-slate-700">{lead.offlineTeachingExperience || 0} Years</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500">Online Experience</span>
                  <span className="font-medium text-slate-700">{lead.onlineTeachingExperience || 0} Years</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-3">Approved Subjects</h4>
                <div className="flex flex-wrap gap-2">
                  {lead.subjects?.length > 0 ? lead.subjects.map((s:any) => (
                    <Badge key={s.subjectId} variant="outline" className="bg-slate-50">{s.subject?.name}</Badge>
                  )) : <span className="text-sm text-slate-400 italic">None assigned</span>}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-3">Approved Grades</h4>
                <div className="flex flex-wrap gap-2">
                  {lead.grades?.length > 0 ? lead.grades.map((g:any) => (
                    <Badge key={g.gradeId} variant="outline" className="bg-slate-50">{g.grade?.name}</Badge>
                  )) : <span className="text-sm text-slate-400 italic">None assigned</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'interactions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Call History</span>
                <Badge className="bg-slate-100 text-slate-600 border-none">{lead.calls?.length || 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.calls?.length > 0 ? (
                <div className="space-y-4">
                  {lead.calls.map((c:any) => (
                    <div key={c.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-sm text-slate-800">{c.remark}</p>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
                        <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                          {(c.caller?.email || '?')[0].toUpperCase()}
                        </div>
                        <p className="text-xs text-slate-500">
                          {c.caller?.email} • {new Date(c.calledAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6 italic">No calls recorded yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Demo Performance</span>
                <Badge className="bg-slate-100 text-slate-600 border-none">{lead.demos?.length || 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.demos?.length > 0 ? (
                <div className="space-y-4">
                  {lead.demos.map((d:any) => (
                    <div key={d.id} className="p-4 bg-slate-50 rounded-lg border border-slate-100 relative">
                      <Badge className={`absolute top-3 right-3 ${d.isLiveDemo ? 'bg-amber-100 text-amber-800 border-none' : 'bg-blue-100 text-blue-800 border-none'}`}>
                        {d.isLiveDemo ? "Live Demo" : "Recorded"}
                      </Badge>
                      <h4 className="font-semibold text-slate-800 flex items-center gap-1.5 mb-2">
                        <Star className="w-4 h-4 text-brand-500" /> Assessment Note
                      </h4>
                      <p className="text-sm text-slate-600 mb-3">{d.remarks}</p>
                      <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-200">
                        <p className="text-xs text-slate-500 font-medium">
                          Reviewed by {d.recordedBy?.email} • {new Date(d.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6 italic">No demos recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'training' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-600 flex items-center gap-2">
              HR Managed Training Sessions
            </CardTitle>
            <p className="text-sm text-slate-500">Candidates do not have OS accounts during this phase. HR is responsible for evaluating tasks and marking attendance manually.</p>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead>Task Status</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lead.trainingSessions?.map((t:any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-slate-700">{new Date(t.sessionDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-slate-600">{t.startTime ? new Date(t.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${t.attendanceStatus === 'ATTENDED' ? 'border-green-200 text-green-700 bg-green-50' : 'border-red-200 text-red-700 bg-red-50'}`}>
                          {t.attendanceStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50">
                          {t.taskStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 italic text-sm">{t.remarks || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {(!lead.trainingSessions || lead.trainingSessions.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-slate-400">
                        No training sessions recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}