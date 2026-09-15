"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { createLeadAction } from '../actions';
import { useRouter } from 'next/navigation';

export function CreateLeadDialog({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<any>(null);
  const router = useRouter();

  const [formData, setFormData] = React.useState({
    firstName: '',
    lastName: '',
    primaryPhone: '',
    source: 'META_FACEBOOK',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const res = await createLeadAction(formData);
      console.log('Create Lead API Response:', res);

      if (!res) {
        throw new Error('No response from server. Please try again.');
      }

      if (res.warnings && res.warnings.length > 0) {
        setWarning(res.warnings[0]);
      } else {
        onSuccess();
        onClose();
        if (res.lead && res.lead.id) {
          router.push(`/leads/${res.lead.id}`);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForceCreate = () => {
    // Backend creates it anyway but returns warning. If we want to proceed past warning, we just close and navigate
    if (warning && warning.existingLead) {
      onSuccess();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Create New Lead</h2>
        
        {error && <Alert variant="error">{error}</Alert>}
        
        {warning && (
          <Alert variant="info" className="bg-amber-50 text-amber-900 border border-amber-200">
            <p className="font-bold mb-1">Possible Duplicate Detected</p>
            <p className="text-sm mb-2">{warning.message}</p>
            <p className="text-xs">Existing: {warning.existingLead.firstName} {warning.existingLead.lastName} ({warning.existingLead.primaryPhone})</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleForceCreate}>Acknowledge & Proceed</Button>
            </div>
          </Alert>
        )}

        {!warning && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">First Name</label>
                <Input required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Last Name</label>
                <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium">Primary Phone *</label>
              <Input required value={formData.primaryPhone} onChange={e => setFormData({...formData, primaryPhone: e.target.value})} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Source *</label>
              <Select required value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
                <option value="META_FACEBOOK">Facebook</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="GOOGLE">Google</option>
                <option value="WEBSITE">Website</option>
                <option value="REFERRAL">Referral</option>
                <option value="DIRECT">Direct</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Lead'}</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
