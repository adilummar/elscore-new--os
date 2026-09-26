"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTutorLeadAction } from "@/app/(app)/tutor-hr/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/tutor-hr/leads" className="text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Tutor Lead</h1>
          <p className="text-slate-500 text-sm mt-1">Enter candidate details to begin the recruitment process.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Personal Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">First Name <span className="text-red-500">*</span></label>
                <Input 
                  required
                  placeholder="e.g. Jane"
                  value={formData.firstName}
                  onChange={e => setFormData({...formData, firstName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Last Name</label>
                <Input 
                  placeholder="e.g. Doe"
                  value={formData.lastName}
                  onChange={e => setFormData({...formData, lastName: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email Address <span className="text-red-500">*</span></label>
                <Input 
                  required
                  type="email" 
                  placeholder="jane.doe@example.com"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Phone Number</label>
                <Input 
                  type="tel" 
                  placeholder="+1 (555) 000-0000"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
            </div>
            
            <hr className="border-slate-100" />
            
            <div>
              <h3 className="font-semibold text-slate-900 mb-4">Professional Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Total Experience (Yrs)</label>
                  <Input 
                    type="number" 
                    min="0"
                    value={formData.totalTeachingExperience || ''}
                    onChange={e => setFormData({...formData, totalTeachingExperience: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Offline Exp (Yrs)</label>
                  <Input 
                    type="number" 
                    min="0"
                    value={formData.offlineTeachingExperience || ''}
                    onChange={e => setFormData({...formData, offlineTeachingExperience: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Expected Rate (/hr)</label>
                  <Input 
                    type="number" 
                    min="0"
                    placeholder="$0.00"
                    value={formData.expectedHourlyRate || ''}
                    onChange={e => setFormData({...formData, expectedHourlyRate: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 flex gap-4 justify-end border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" isLoading={loading}>
                Create Lead
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}