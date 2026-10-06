const fs = require('fs');
const content = `
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientApi as api } from "@/app/(app)/tutor-hr/api";
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
      const res = await api('/tutor-hr/leads', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
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
fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/leads/new/page.tsx', content.trim());
console.log('Fixed new lead form');
