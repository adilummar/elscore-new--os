"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Phone, Mail, BookOpen, GraduationCap,
  PhoneCall, Video, Dumbbell, History, ChevronDown,
  CheckCircle2, XCircle, Plus
} from "lucide-react";
import {
  getTutorLeadAction, updateTutorLeadStageAction,
  approveTutorLeadAction, recordCallAction, recordDemoAction,
  addTrainingSessionAction, updateTrainingSessionAction,
} from "@/app/(app)/tutor-hr/actions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";

const STAGES = [
  { value: "LEAD", label: "Lead" },
  { value: "DETAILS_SHARED", label: "Details Shared" },
  { value: "CV_SHARED", label: "CV Shared" },
  { value: "DEMO", label: "Demo" },
  { value: "TRAINING", label: "Training" },
  { value: "READY_FOR_ASSIGNMENT", label: "Ready for Assignment" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "REJECTED", label: "Rejected" },
];

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-slate-100 text-slate-700",
  DETAILS_SHARED: "bg-blue-100 text-blue-700",
  CV_SHARED: "bg-indigo-100 text-indigo-700",
  DEMO: "bg-amber-100 text-amber-700",
  TRAINING: "bg-orange-100 text-orange-700",
  READY_FOR_ASSIGNMENT: "bg-green-100 text-green-700",
  NOT_INTERESTED: "bg-slate-200 text-slate-500",
  REJECTED: "bg-red-100 text-red-600",
};

const TABS = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "calls", label: "Calls", icon: PhoneCall },
  { id: "demo", label: "Demo", icon: Video },
  { id: "training", label: "Training", icon: Dumbbell },
  { id: "history", label: "History", icon: History },
];

export default function TutorLeadDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Stage change state
  const [stageChanging, setStageChanging] = useState(false);
  const [newStage, setNewStage] = useState("");
  const [stageRemarks, setStageRemarks] = useState("");
  const [showStageModal, setShowStageModal] = useState(false);

  // Call state
  const [showCallForm, setShowCallForm] = useState(false);
  const [callRemark, setCallRemark] = useState("");
  const [savingCall, setSavingCall] = useState(false);

  // Demo state
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [demoForm, setDemoForm] = useState({ isLiveDemo: false, remarks: "", demoDate: "", startTime: "", endTime: "" });
  const [savingDemo, setSavingDemo] = useState(false);

  // Training state
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingForm, setTrainingForm] = useState({ sessionDate: "", attendanceStatus: "ATTENDED", taskStatus: "DONE", remarks: "" });
  const [savingTraining, setSavingTraining] = useState(false);

  // Approving
  const [approving, setApproving] = useState(false);

  async function reload() {
    try {
      const res = await getTutorLeadAction(id);
      setLead(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, [id]);

  // Stage change
  async function initiateStageChange(stage: string) {
    if (stage === lead.currentStage) return;
    setNewStage(stage);
    setStageRemarks("");
    setShowStageModal(true);
  }

  async function confirmStageChange() {
    setStageChanging(true);
    try {
      await updateTutorLeadStageAction(id, newStage, stageRemarks || undefined);
      setShowStageModal(false);
      await reload();
    } catch (err: any) {
      alert("Error: " + (err?.message ?? "Could not change stage"));
    } finally {
      setStageChanging(false);
    }
  }

  // Approve
  async function handleApprove() {
    const employeeId = prompt(
      'To approve this candidate:\n' +
      '1. First onboard them as an Employee in the HR module\n' +
      '2. Then enter their Employee ID here\n\nEmployee ID:'
    );
    if (!employeeId?.trim()) return;
    setApproving(true);
    try {
      await approveTutorLeadAction(id, { existingEmployeeId: employeeId.trim() });
      alert('Approved! Tutor Profile created and linked.');
      await reload();
    } catch (err: any) {
      alert('Error: ' + (err?.message ?? 'Could not approve'));
    } finally {
      setApproving(false);
    }
  }

  // Record call
  async function handleRecordCall(e: React.FormEvent) {
    e.preventDefault();
    setSavingCall(true);
    try {
      await recordCallAction(id, { remark: callRemark });
      setCallRemark("");
      setShowCallForm(false);
      await reload();
    } catch (err: any) {
      alert("Error: " + err?.message);
    } finally {
      setSavingCall(false);
    }
  }

  // Record demo
  async function handleRecordDemo(e: React.FormEvent) {
    e.preventDefault();
    setSavingDemo(true);
    try {
      await recordDemoAction(id, {
        isLiveDemo: demoForm.isLiveDemo,
        remarks: demoForm.remarks,
        demoDate: demoForm.demoDate || undefined,
        startTime: demoForm.startTime || undefined,
        endTime: demoForm.endTime || undefined,
      });
      setDemoForm({ isLiveDemo: false, remarks: "", demoDate: "", startTime: "", endTime: "" });
      setShowDemoForm(false);
      await reload();
    } catch (err: any) {
      alert("Error: " + err?.message);
    } finally {
      setSavingDemo(false);
    }
  }

  // Add training session
  async function handleAddTraining(e: React.FormEvent) {
    e.preventDefault();
    setSavingTraining(true);
    try {
      await addTrainingSessionAction(id, trainingForm);
      setTrainingForm({ sessionDate: "", attendanceStatus: "ATTENDED", taskStatus: "DONE", remarks: "" });
      setShowTrainingForm(false);
      await reload();
    } catch (err: any) {
      alert("Error: " + err?.message);
    } finally {
      setSavingTraining(false);
    }
  }

  if (loading) return (
    <div className="p-12 text-center text-slate-500">
      <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto mb-4" />
      Loading candidate profile...
    </div>
  );
  if (!lead) return <div className="p-12 text-center text-red-500 font-medium">Candidate not found</div>;

  return (
    <div className="space-y-6">

      {/* ── Stage Change Confirmation Modal ── */}
      {showStageModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Confirm Stage Change</h3>
            <p className="text-sm text-slate-600">
              Move <strong>{lead.firstName} {lead.lastName}</strong> from{" "}
              <span className="font-medium">{lead.currentStage}</span> →{" "}
              <span className="font-medium text-brand-700">{newStage}</span>?
            </p>
            {newStage === "TRAINING" && lead.trainingStartedAt === null && (
              <p className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded p-2">
                Training start time will be recorded automatically.
              </p>
            )}
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Remarks (optional)</label>
              <textarea
                className="w-full border border-slate-200 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
                rows={3}
                placeholder="Reason for stage change..."
                value={stageRemarks}
                onChange={e => setStageRemarks(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowStageModal(false)}>Cancel</Button>
              <Button onClick={confirmStageChange} disabled={stageChanging}>
                {stageChanging ? "Saving..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <Link href="/tutor-hr/leads" className="mt-1 text-slate-400 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                {lead.firstName} {lead.lastName}
              </h1>
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">{lead.businessId}</span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
              {lead.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {lead.email}</span>}
              {lead.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {lead.phone}</span>}
            </div>
          </div>
        </div>

        {/* Stage control */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Pipeline Stage</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${STAGE_COLORS[lead.currentStage] ?? "bg-slate-100 text-slate-600"}`}>
              {STAGES.find(s => s.value === lead.currentStage)?.label ?? lead.currentStage}
            </span>
          </div>
          <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-3">
            <Select
              value=""
              onChange={e => { if (e.target.value) initiateStageChange(e.target.value); }}
              className="text-sm min-w-[160px]"
            >
              <option value="">Change stage...</option>
              {STAGES.filter(s => s.value !== lead.currentStage).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
            {lead.currentStage === "READY_FOR_ASSIGNMENT" && (
              <Button
                onClick={handleApprove}
                disabled={approving}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1.5 whitespace-nowrap"
                size="sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                {approving ? "Approving..." : "Approve"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Training notice */}
      {lead.currentStage === "TRAINING" && lead.trainingStartedAt && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-sm text-orange-800 flex items-center gap-2">
          <Dumbbell className="w-4 h-4 shrink-0" />
          Training started: <strong>{new Date(lead.trainingStartedAt).toLocaleString()}</strong>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-lg"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Professional Experience</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Total Teaching Experience", value: `${lead.totalTeachingExperience ?? 0} months` },
                { label: "Offline Experience", value: `${lead.offlineTeachingExperience ?? 0} months` },
                { label: "Online Experience (derived)", value: `${lead.onlineTeachingExperience ?? 0} months` },
                { label: "Expected Hourly Rate", value: lead.expectedHourlyRate ? `${lead.expectedHourlyRate}` : "Not specified" },
                { label: "Mother Tongue", value: lead.motherTongue?.name ?? "Not specified" },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-500">{row.label}</span>
                  <span className="text-sm font-semibold text-slate-800">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Capabilities</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Subjects</h4>
                <div className="flex flex-wrap gap-2">
                  {lead.subjects?.length > 0
                    ? lead.subjects.map((s: any) => <Badge key={s.subjectId} className="bg-blue-50 text-blue-700 border-none">{s.subject?.name}</Badge>)
                    : <span className="text-sm text-slate-400 italic">None assigned</span>}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Grades</h4>
                <div className="flex flex-wrap gap-2">
                  {lead.grades?.length > 0
                    ? lead.grades.map((g: any) => <Badge key={g.gradeId} className="bg-slate-100 text-slate-700 border-none">{g.grade?.name}</Badge>)
                    : <span className="text-sm text-slate-400 italic">None assigned</span>}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Communication Languages</h4>
                <div className="flex flex-wrap gap-2">
                  {lead.languages?.length > 0
                    ? lead.languages.map((l: any) => <Badge key={l.languageId} className="bg-green-50 text-green-700 border-none">{l.language?.name}</Badge>)
                    : <span className="text-sm text-slate-400 italic">None specified</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          {lead.remarks && (
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Remarks</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 leading-relaxed">{lead.remarks}</p>
              </CardContent>
            </Card>
          )}

          {lead.salarySlab ? (
            <Card>
              <CardHeader><CardTitle>Salary Slab</CardTitle></CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-800">{lead.salarySlab.name}</span>
                  <span className="text-brand-700 font-bold">{lead.salarySlab.hourlyRate} / hr</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Salary Slab</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm italic text-amber-600">Salary Slab: NOT SELECTED</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: CALLS
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "calls" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Call History</h2>
            <Button onClick={() => setShowCallForm(v => !v)} size="sm" className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Log Call
            </Button>
          </div>

          {showCallForm && (
            <Card className="border-brand-200">
              <CardHeader><CardTitle className="text-base">Log a Call</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleRecordCall} className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block">Remarks *</label>
                    <textarea
                      required
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
                      rows={3}
                      placeholder="What was discussed on the call?"
                      value={callRemark}
                      onChange={e => setCallRemark(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setShowCallForm(false)}>Cancel</Button>
                    <Button type="submit" disabled={savingCall}>{savingCall ? "Saving..." : "Save Call"}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {lead.calls?.length > 0 ? (
            <div className="space-y-3">
              {lead.calls.map((c: any) => (
                <div key={c.id} className="p-4 bg-white rounded-lg border border-slate-100 shadow-sm">
                  <p className="text-sm text-slate-800">{c.remark}</p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                    <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                      {(c.caller?.email ?? "?")[0].toUpperCase()}
                    </div>
                    <p className="text-xs text-slate-500">{c.caller?.email} • {new Date(c.calledAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <PhoneCall className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No calls recorded yet</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: DEMO
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "demo" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Demo Records</h2>
            <Button onClick={() => setShowDemoForm(v => !v)} size="sm" className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Demo
            </Button>
          </div>

          {showDemoForm && (
            <Card className="border-brand-200">
              <CardHeader><CardTitle className="text-base">Record Demo</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleRecordDemo} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isLive"
                      checked={demoForm.isLiveDemo}
                      onChange={e => setDemoForm(f => ({ ...f, isLiveDemo: e.target.checked }))}
                      className="w-4 h-4 text-brand-600"
                    />
                    <label htmlFor="isLive" className="text-sm font-medium text-slate-700">Live Demo (with scheduled slot)</label>
                  </div>
                  {demoForm.isLiveDemo && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-7">
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Date</label>
                        <input type="date" required={demoForm.isLiveDemo} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" value={demoForm.demoDate} onChange={e => setDemoForm(f => ({ ...f, demoDate: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Start Time</label>
                        <input type="time" className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" value={demoForm.startTime} onChange={e => setDemoForm(f => ({ ...f, startTime: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">End Time</label>
                        <input type="time" className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" value={demoForm.endTime} onChange={e => setDemoForm(f => ({ ...f, endTime: e.target.value }))} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block">Assessment Notes *</label>
                    <textarea
                      required
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
                      rows={3}
                      placeholder="How did the demo go? Observations..."
                      value={demoForm.remarks}
                      onChange={e => setDemoForm(f => ({ ...f, remarks: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setShowDemoForm(false)}>Cancel</Button>
                    <Button type="submit" disabled={savingDemo}>{savingDemo ? "Saving..." : "Save Demo"}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {lead.demos?.length > 0 ? (
            <div className="space-y-3">
              {lead.demos.map((d: any) => (
                <div key={d.id} className="p-4 bg-white rounded-lg border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={d.isLiveDemo ? "bg-amber-100 text-amber-800 border-none" : "bg-blue-100 text-blue-800 border-none"}>
                      {d.isLiveDemo ? "Live Demo" : "Demo Shared"}
                    </Badge>
                    <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</span>
                  </div>
                  {d.isLiveDemo && d.demoDate && (
                    <p className="text-xs text-slate-500 mt-2">
                      📅 {new Date(d.demoDate).toLocaleDateString()}
                      {d.startTime && ` • ${new Date(d.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      {d.endTime && ` – ${new Date(d.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  )}
                  <p className="text-sm text-slate-700 mt-2">{d.remarks}</p>
                  <p className="text-xs text-slate-400 mt-2">Recorded by {d.recordedBy?.email}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <Video className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No demo records yet</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: TRAINING
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "training" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Training Sessions</h2>
              <p className="text-xs text-slate-500 mt-0.5">Managed by Tutor HR. Candidate does not have OS access during training.</p>
            </div>
            <Button onClick={() => setShowTrainingForm(v => !v)} size="sm" className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Session
            </Button>
          </div>

          {lead.trainingStartedAt && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 text-sm text-orange-800">
              <span className="font-semibold">Training started:</span> {new Date(lead.trainingStartedAt).toLocaleString()}
            </div>
          )}

          {showTrainingForm && (
            <Card className="border-brand-200">
              <CardHeader><CardTitle className="text-base">Add Training Session</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleAddTraining} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Session Date *</label>
                      <input type="date" required className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm" value={trainingForm.sessionDate} onChange={e => setTrainingForm(f => ({ ...f, sessionDate: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Attendance</label>
                      <Select value={trainingForm.attendanceStatus} onChange={e => setTrainingForm(f => ({ ...f, attendanceStatus: e.target.value }))}>
                        <option value="ATTENDED">Attended</option>
                        <option value="NOT_ATTENDED">Not Attended</option>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Task Status</label>
                      <Select value={trainingForm.taskStatus} onChange={e => setTrainingForm(f => ({ ...f, taskStatus: e.target.value }))}>
                        <option value="DONE">Done</option>
                        <option value="NOT_DONE">Not Done</option>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Remarks</label>
                      <input type="text" className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm" placeholder="Optional notes..." value={trainingForm.remarks} onChange={e => setTrainingForm(f => ({ ...f, remarks: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setShowTrainingForm(false)}>Cancel</Button>
                    <Button type="submit" disabled={savingTraining}>{savingTraining ? "Saving..." : "Add Session"}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {lead.trainingSessions?.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Date", "Attendance", "Task", "Remarks"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lead.trainingSessions.map((t: any) => (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-700">{new Date(t.sessionDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {t.attendanceStatus === "ATTENDED"
                          ? <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Attended</span>
                          : <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3.5 h-3.5" /> Not Attended</span>}
                      </td>
                      <td className="px-4 py-3">
                        {t.taskStatus === "DONE"
                          ? <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>
                          : <span className="flex items-center gap-1 text-slate-400"><XCircle className="w-3.5 h-3.5" /> Not Done</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 italic">{t.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No training sessions recorded yet</p>
              <p className="text-xs text-slate-300 mt-1">Move the lead to TRAINING stage, then add sessions</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: HISTORY
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Stage History</h2>
          {lead.stageHistory?.length > 0 ? (
            <div className="relative border-l-2 border-slate-200 ml-4 space-y-6">
              {lead.stageHistory.map((h: any, i: number) => (
                <div key={h.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-white border-2 border-brand-400 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  </div>
                  <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {h.previousStage && (
                        <>
                          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{h.previousStage}</span>
                          <ChevronDown className="w-3 h-3 text-slate-400 rotate-[-90deg]" />
                        </>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STAGE_COLORS[h.newStage] ?? "bg-slate-100 text-slate-600"}`}>{h.newStage}</span>
                    </div>
                    {h.remarks && <p className="text-sm text-slate-600 mt-2 italic">&ldquo;{h.remarks}&rdquo;</p>}
                    <p className="text-xs text-slate-400 mt-2">
                      By {h.changedBy?.email ?? "system"} • {new Date(h.changedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No stage history yet</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}