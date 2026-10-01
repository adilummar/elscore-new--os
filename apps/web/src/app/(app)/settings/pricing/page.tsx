"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { usePermissions, useAuth } from '@/components/providers/AuthProvider';
import { getReferenceDataAction } from '../../leads/actions';
import { Modal } from '@/components/ui/Modal';

export default function PricingSettingsPage() {
  const { hasPermission } = usePermissions();
  
  const [slabs, setSlabs] = React.useState<any[]>([]);
  const [exceptionalRates, setExceptionalRates] = React.useState<any[]>([]);
  
  const [subjects, setSubjects] = React.useState<any[]>([]);
  const [curriculums, setCurriculums] = React.useState<any[]>([]);
  
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isSlabModalOpen, setIsSlabModalOpen] = React.useState(false);
  const [isExModalOpen, setIsExModalOpen] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [slabsRes, exRes, subRes, curRes] = await Promise.all([
        fetch('/api/pricing/slabs'),
        fetch('/api/pricing/exceptional-rates'),
        getReferenceDataAction('subjects'),
        getReferenceDataAction('curricula')
      ]);

      if (!slabsRes.ok || !exRes.ok) throw new Error('Failed to load pricing data');
      
      setSlabs(await slabsRes.json());
      setExceptionalRates(await exRes.json());
      setSubjects(subRes.data || []);
      setCurriculums(curRes.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSlab = async (id: string, current: boolean) => {
    await fetch(`/api/pricing/slabs/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json',  },
      body: JSON.stringify({ isActive: !current })
    });
    loadData();
  };

  const toggleEx = async (id: string, current: boolean) => {
    await fetch(`/api/pricing/exceptional-rates/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json',  },
      body: JSON.stringify({ isActive: !current })
    });
    loadData();
  };

  if (loading && slabs.length === 0) return <div className="p-8 text-center">Loading pricing configuration...</div>;
  if (!hasPermission('pricing.manage')) return <div className="p-8 text-center text-red-500">You do not have permission to manage pricing.</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pricing Settings</h1>
          <p className="text-slate-500">Manage global pricing slabs and exceptional subject rates.</p>
        </div>
      </div>
      
      {error && <div className="p-4 bg-red-50 text-red-600 rounded-md">{error}</div>}

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>General Pricing Slabs</CardTitle>
          <Button onClick={() => setIsSlabModalOpen(true)} size="sm">Add Slab</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Curriculum</th>
                  <th className="px-4 py-3">Grade Range</th>
                  <th className="px-4 py-3">Hourly Rate (AED)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slabs.map((slab) => (
                  <tr key={slab.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{slab.curriculum?.name || slab.curriculumId}</td>
                    <td className="px-4 py-3">Grade {slab.gradeFrom} to Grade {slab.gradeTo}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{slab.hourlyRate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={slab.isActive ? 'success' : 'default'}>
                        {slab.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => toggleSlab(slab.id, slab.isActive)}>
                        {slab.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {slabs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No slabs configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Exceptional Subject Rates</CardTitle>
          <Button onClick={() => setIsExModalOpen(true)} size="sm">Add Exceptional Rate</Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-brand-600 font-medium mb-4 bg-brand-50 p-3 rounded-md border border-brand-100">
            Exceptional subject rates apply regardless of curriculum or grade and override general slabs.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Hourly Rate (AED)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exceptionalRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{rate.subject?.name || rate.subjectId}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{rate.hourlyRate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={rate.isActive ? 'success' : 'default'}>
                        {rate.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => toggleEx(rate.id, rate.isActive)}>
                        {rate.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {exceptionalRates.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No exceptional rates configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AddSlabModal 
        isOpen={isSlabModalOpen} 
        onClose={() => setIsSlabModalOpen(false)} 
        onSuccess={loadData} 
        curriculums={curriculums}
      />
      
      <AddExceptionalModal 
        isOpen={isExModalOpen} 
        onClose={() => setIsExModalOpen(false)} 
        onSuccess={loadData} 
        subjects={subjects}
      />
    </div>
  );
}

function AddSlabModal({ isOpen, onClose, onSuccess, curriculums }: any) {
  const [curriculumId, setCurriculumId] = React.useState('');
  const [gradeFrom, setGradeFrom] = React.useState('');
  const [gradeTo, setGradeTo] = React.useState('');
  const [hourlyRate, setHourlyRate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/pricing/slabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',  },
        body: JSON.stringify({ 
          curriculumId, 
          gradeFrom: Number(gradeFrom), 
          gradeTo: Number(gradeTo), 
          hourlyRate: Number(hourlyRate) 
        })
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed to create');
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Add General Pricing Slab</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <div>
          <label className="text-sm font-medium">Curriculum *</label>
          <Select value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)} required>
            <option value="">Select Curriculum</option>
            {curriculums.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Grade From (Sort Order) *</label>
            <input type="number" required min="0" value={gradeFrom} onChange={(e) => setGradeFrom(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium">Grade To (Sort Order) *</label>
            <input type="number" required min="0" value={gradeTo} onChange={(e) => setGradeTo(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Hourly Rate (AED) *</label>
          <input type="number" required min="1" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="w-full p-2 border rounded-md" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>Save Slab</Button>
        </div>
      </form>
    </Modal>
  );
}

function AddExceptionalModal({ isOpen, onClose, onSuccess, subjects }: any) {
  const [subjectId, setSubjectId] = React.useState('');
  const [hourlyRate, setHourlyRate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/pricing/exceptional-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',  },
        body: JSON.stringify({ 
          subjectId, 
          hourlyRate: Number(hourlyRate) 
        })
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed to create');
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Add Exceptional Subject Rate</h2>
      <p className="text-xs text-brand-600 mb-4 bg-brand-50 p-2 rounded">
        This rate overrides standard slabs and applies regardless of grade/curriculum.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <div>
          <label className="text-sm font-medium">Subject *</label>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            <option value="">Select Subject</option>
            {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Hourly Rate (AED) *</label>
          <input type="number" required min="1" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="w-full p-2 border rounded-md" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>Save Rate</Button>
        </div>
      </form>
    </Modal>
  );
}
