"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getReferenceDataAction } from '../../leads/actions';
import {
  createExceptionalRateAction,
  createPricingSlabAction,
  getExceptionalRatesAction,
  getFinanceSettingAction,
  getPricingSlabsAction,
  updateExceptionalRateAction,
  updateExceptionalRateStatusAction,
  updatePricingSlabAction,
  updatePricingSlabStatusAction,
  upsertFinanceSettingAction,
} from '../actions';
import { Modal } from '@/components/ui/Modal';
import { exceptionalGradeSelection, formatSlabGradeRange, gradeIdForSortOrder, slabSortOrdersForGrades } from './grade-range';

export default function PricingSettingsPage() {
  const { hasPermission } = usePermissions();

  const [slabs, setSlabs] = React.useState<any[]>([]);
  const [exceptionalRates, setExceptionalRates] = React.useState<any[]>([]);
  const [financeSetting, setFinanceSetting] = React.useState<any>(null);

  const [subjects, setSubjects] = React.useState<any[]>([]);
  const [curriculums, setCurriculums] = React.useState<any[]>([]);
  const [grades, setGrades] = React.useState<any[]>([]);
  const [editingSlab, setEditingSlab] = React.useState<any>(null);
  const [editingRate, setEditingRate] = React.useState<any>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isSlabModalOpen, setIsSlabModalOpen] = React.useState(false);
  const [isExModalOpen, setIsExModalOpen] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [slabsRes, exRes, financeRes, subRes, curRes, gradeRes] = await Promise.all([
        getPricingSlabsAction(),
        getExceptionalRatesAction(),
        getFinanceSettingAction(),
        getReferenceDataAction('subjects'),
        getReferenceDataAction('curricula'),
        getReferenceDataAction('grades'),
      ]);

      setSlabs(Array.isArray(slabsRes) ? slabsRes : []);
      setExceptionalRates(Array.isArray(exRes) ? exRes : []);
      setFinanceSetting(financeRes);
      setSubjects(subRes?.data || subRes || []);
      setCurriculums(curRes?.data || curRes || []);
      setGrades(gradeRes?.data || gradeRes || []);
      setError(null);
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
    await updatePricingSlabStatusAction(id, !current);
    loadData();
  };

  const toggleEx = async (id: string, current: boolean) => {
    await updateExceptionalRateStatusAction(id, !current);
    loadData();
  };

  if (loading && slabs.length === 0) return <div className="p-8 text-center">Loading pricing configuration...</div>;
  if (!hasPermission('pricing.manage')) return <div className="p-8 text-center text-red-500">You do not have permission to manage pricing.</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pricing Settings</h1>
          <p className="text-slate-500">
            General slabs price by curriculum and grade range for all subjects. Subject-specific overrides belong in Exceptional Subject Rates.
          </p>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-600 rounded-md">{error}</div>}

      <FinanceSettingsCard setting={financeSetting} onSuccess={loadData} />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div className="space-y-1">
            <CardTitle>General Pricing Slabs</CardTitle>
            <p className="text-sm text-slate-500">
              Curriculum + grade range only. This hourly rate applies to all subjects in that range.
            </p>
          </div>
          <Button onClick={() => { setEditingSlab(null); setIsSlabModalOpen(true); }} size="sm" className="shrink-0">Add Slab</Button>
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
                    <td className="px-4 py-3">{formatSlabGradeRange(grades, slab.gradeFrom, slab.gradeTo)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{slab.hourlyRate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={slab.isActive ? 'success' : 'default'}>
                        {slab.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditingSlab(slab); setIsSlabModalOpen(true); }}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleSlab(slab.id, slab.isActive)}>
                          {slab.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
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
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div className="space-y-1">
            <CardTitle>Exceptional Subject Rates</CardTitle>
            <p className="text-sm text-slate-500">
              Subject and exact grade hourly rates. An exception applies only to that subject and grade.
            </p>
          </div>
          <Button onClick={() => { setEditingRate(null); setIsExModalOpen(true); }} size="sm" className="shrink-0">Add Exceptional Rate</Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-brand-600 font-medium mb-4 bg-brand-50 p-3 rounded-md border border-brand-100">
            An exceptional rate overrides the general slab only for the selected subject and exact grade.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Hourly Rate (AED)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exceptionalRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{rate.subject?.name || rate.subjectId}</td>
                    <td className="px-4 py-3">{rate.grade?.name || 'Grade required'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{rate.hourlyRate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={rate.isActive ? 'success' : 'default'}>
                        {rate.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditingRate(rate); setIsExModalOpen(true); }}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleEx(rate.id, rate.isActive)}>
                          {rate.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {exceptionalRates.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No exceptional rates configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AddSlabModal
        isOpen={isSlabModalOpen}
        onClose={() => { setIsSlabModalOpen(false); setEditingSlab(null); }}
        onSuccess={loadData}
        curriculums={curriculums}
        grades={grades}
        slab={editingSlab}
      />

      <AddExceptionalModal
        isOpen={isExModalOpen}
        onClose={() => { setIsExModalOpen(false); setEditingRate(null); }}
        onSuccess={loadData}
        subjects={subjects}
        grades={grades}
        rate={editingRate}
      />
    </div>
  );
}

function FinanceSettingsCard({ setting, onSuccess }: { setting: any; onSuccess: () => void }) {
  const [registrationFee, setRegistrationFee] = React.useState(setting?.registrationFee ?? '');
  const [accountHolderName, setAccountHolderName] = React.useState(setting?.accountHolderName ?? '');
  const [bankName, setBankName] = React.useState(setting?.bankName ?? '');
  const [accountNumber, setAccountNumber] = React.useState(setting?.accountNumber ?? '');
  const [iban, setIban] = React.useState(setting?.iban ?? '');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setRegistrationFee(setting?.registrationFee ?? '');
    setAccountHolderName(setting?.accountHolderName ?? '');
    setBankName(setting?.bankName ?? '');
    setAccountNumber(setting?.accountNumber ?? '');
    setIban(setting?.iban ?? '');
  }, [setting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await upsertFinanceSettingAction({
        registrationFee: Number(registrationFee),
        accountHolderName,
        bankName,
        accountNumber,
        iban,
        currency: 'AED',
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save finance settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quotation Account Details</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500 mb-4">
          These values are snapshotted onto each generated quotation. Historical PDFs do not change when you update this form.
          Currency is AED.
        </p>
        {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Registration Fee (AED) *</label>
            <input type="number" required min="0" step="0.01" value={registrationFee} onChange={(e) => setRegistrationFee(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div>
            <label className="text-sm font-medium">Currency</label>
            <input value="AED" disabled className="w-full p-2 border rounded-md bg-slate-50" />
          </div>
          <div>
            <label className="text-sm font-medium">Account Holder Name *</label>
            <input required value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div>
            <label className="text-sm font-medium">Bank Name *</label>
            <input required value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div>
            <label className="text-sm font-medium">Account Number *</label>
            <input required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div>
            <label className="text-sm font-medium">IBAN *</label>
            <input required value={iban} onChange={(e) => setIban(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Account Details'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AddSlabModal({ isOpen, onClose, onSuccess, curriculums, grades, slab }: any) {
  const [curriculumId, setCurriculumId] = React.useState('');
  const [gradeFromId, setGradeFromId] = React.useState('');
  const [gradeToId, setGradeToId] = React.useState('');
  const [hourlyRate, setHourlyRate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setCurriculumId(slab?.curriculumId || '');
    setGradeFromId(slab ? gradeIdForSortOrder(grades, slab.gradeFrom) : '');
    setGradeToId(slab ? gradeIdForSortOrder(grades, slab.gradeTo) : '');
    setHourlyRate(slab?.hourlyRate ?? '');
    setError('');
  }, [isOpen, slab, grades]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const range = slabSortOrdersForGrades(grades, gradeFromId, gradeToId);
      const payload = {
        curriculumId,
        gradeFrom: range.gradeFrom,
        gradeTo: range.gradeTo,
        hourlyRate: Number(hourlyRate),
      };
      if (slab?.id) {
        await updatePricingSlabAction(slab.id, payload);
      } else {
        await createPricingSlabAction(payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-2">{slab ? 'Edit General Pricing Slab' : 'Add General Pricing Slab'}</h2>
      <p className="text-xs text-slate-500 mb-4">
        Applies to all subjects for this curriculum and grade range. Subject-specific pricing is added under Exceptional Subject Rates.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <div>
          <label className="text-sm font-medium">Curriculum *</label>
          <Select value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)} required>
            <option value="">Select Curriculum</option>
            {curriculums.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Grade From *</label>
            <Select value={gradeFromId} onChange={(e) => setGradeFromId(e.target.value)} required>
              <option value="">Select Grade</option>
              {grades.map((grade: any) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium">Grade To *</label>
            <Select value={gradeToId} onChange={(e) => setGradeToId(e.target.value)} required>
              <option value="">Select Grade</option>
              {grades.map((grade: any) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Hourly Rate (AED) *</label>
          <input type="number" required min="1" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="w-full p-2 border rounded-md" placeholder="11.00" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{slab ? 'Save Changes' : 'Save Slab'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AddExceptionalModal({ isOpen, onClose, onSuccess, subjects, grades, rate }: any) {
  const [subjectId, setSubjectId] = React.useState('');
  const [gradeId, setGradeId] = React.useState('');
  const [hourlyRate, setHourlyRate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setSubjectId(rate?.subjectId || '');
    setGradeId(rate?.gradeId || '');
    setHourlyRate(rate?.hourlyRate ?? '');
    setError('');
  }, [isOpen, rate]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const selectedGrade = exceptionalGradeSelection(grades, gradeId);
      const payload = {
        subjectId,
        gradeId: selectedGrade.gradeId,
        hourlyRate: Number(hourlyRate),
      };
      if (rate?.id) {
        await updateExceptionalRateAction(rate.id, payload);
      } else {
        await createExceptionalRateAction(payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-2">{rate ? 'Edit Exceptional Subject Rate' : 'Add Exceptional Subject Rate'}</h2>
      <p className="text-xs text-brand-600 mb-4 bg-brand-50 p-2 rounded">
        This hourly rate applies only to the selected subject and exact grade. It does not apply to other grades of the same subject.
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
          <label className="text-sm font-medium">Grade *</label>
          <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)} required>
            <option value="">Select Grade</option>
            {grades.map((grade: any) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Exceptional Hourly Rate (AED) *</label>
          <input type="number" required min="1" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="w-full p-2 border rounded-md" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{rate ? 'Save Changes' : 'Save Rate'}</Button>
        </div>
      </form>
    </Modal>
  );
}
