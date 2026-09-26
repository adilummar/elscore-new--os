"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, User, BookOpen, GraduationCap, Clock } from "lucide-react";
import { getPendingReviewsAction, approveTutorLeadAction } from "@/app/(app)/tutor-hr/actions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

export default function TutorHrReviewsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await getPendingReviewsAction();
      setLeads(Array.isArray(res) ? res : res?.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(lead: any) {
    if (!confirm(
      `Approve ${lead.firstName} ${lead.lastName} (${lead.businessId})?\n\n` +
      `This will create a Tutor Profile record linked to this candidate.\n` +
      `No login account will be created — employee onboarding is a separate process.`
    )) return;

    setApprovingId(lead.id);
    try {
      await approveTutorLeadAction(lead.id, {});
      alert(`✅ ${lead.firstName} ${lead.lastName} has been approved and a Tutor Profile created.`);
      await load();
    } catch (err: any) {
      alert("Error approving: " + (err?.message ?? "Unknown error"));
    } finally {
      setApprovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto mb-4" />
        Loading pending reviews...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pending Reviews</h1>
        <p className="text-sm text-slate-500 mt-1">
          Candidates who have completed training and are ready for approval as Tutors.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <Clock className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 font-medium">
          {leads.length} candidate{leads.length !== 1 ? 's' : ''} awaiting Tutor HR review
        </p>
      </div>

      {/* Empty state */}
      {leads.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">All clear!</h3>
            <p className="text-sm text-slate-500 mt-1">No candidates are pending review right now.</p>
          </CardContent>
        </Card>
      )}

      {/* Review cards */}
      <div className="grid gap-4">
        {leads.map((lead) => (
          <Card key={lead.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left: candidate info */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg shrink-0">
                    {lead.firstName?.[0]}{lead.lastName?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {lead.firstName} {lead.lastName}
                      </h3>
                      <Badge className="bg-slate-100 text-slate-600 text-xs border-none">
                        {lead.businessId}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{lead.phone}</p>

                    {/* Quick profile summary */}
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
                      {lead.motherTongue && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {lead.motherTongue.name}
                        </span>
                      )}
                      {lead.subjects?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {lead.subjects.slice(0, 3).map((s: any) => s.subject?.name).join(', ')}
                          {lead.subjects.length > 3 && ` +${lead.subjects.length - 3}`}
                        </span>
                      )}
                      {lead.grades?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" />
                          {lead.grades.slice(0, 3).map((g: any) => g.grade?.name).join(', ')}
                          {lead.grades.length > 3 && ` +${lead.grades.length - 3}`}
                        </span>
                      )}
                      {lead.salarySlab && (
                        <span className="font-medium text-slate-700">
                          Slab: {lead.salarySlab.name}
                        </span>
                      )}
                      {!lead.salarySlab && (
                        <span className="italic text-amber-600">Salary Slab: NOT SELECTED</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <Link href={`/tutor-hr/leads/${lead.id}`}>
                    <Button variant="outline" size="sm">
                      View Profile
                    </Button>
                  </Link>
                  <Button
                    onClick={() => handleApprove(lead)}
                    disabled={approvingId === lead.id}
                    className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                    size="sm"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {approvingId === lead.id ? 'Approving...' : 'Approve as Tutor'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
