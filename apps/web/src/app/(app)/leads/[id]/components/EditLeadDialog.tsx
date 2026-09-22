"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { updateLeadDetailsAction } from '../../actions';

export function EditLeadDialog({
  lead,
  isOpen,
  onClose,
  onSuccess
}: {
  lead: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [firstName, setFirstName] = React.useState(lead?.firstName || '');
  const [lastName, setLastName] = React.useState(lead?.lastName || '');
  const [primaryPhone, setPrimaryPhone] = React.useState(lead?.primaryPhone || '');
  const [altPhone1, setAltPhone1] = React.useState(lead?.altPhone1 || '');
  const [altPhone2, setAltPhone2] = React.useState(lead?.altPhone2 || '');
  const [whatsappNumber, setWhatsappNumber] = React.useState(lead?.whatsappNumber || '');
  const [source, setSource] = React.useState(lead?.source || 'OTHER');

  React.useEffect(() => {
    if (isOpen) {
      setFirstName(lead?.firstName || '');
      setLastName(lead?.lastName || '');
      setPrimaryPhone(lead?.primaryPhone || '');
      setAltPhone1(lead?.altPhone1 || '');
      setAltPhone2(lead?.altPhone2 || '');
      setWhatsappNumber(lead?.whatsappNumber || '');
      setSource(lead?.source || 'OTHER');
      setError(null);
    }
  }, [isOpen, lead]);

  /** Returns true if the phone value is either empty (optional) or has subscriber digits beyond the country code. */
  const hasSubscriberDigits = (phone: string) => {
    if (!phone) return true;
    return !/^\+\d{1,4}$/.test(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }

    if (!hasSubscriberDigits(primaryPhone)) {
      setError('Primary phone number is required — please enter the subscriber digits.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const payload = {
        firstName,
        lastName,
        primaryPhone,
        altPhone1,
        altPhone2,
        whatsappNumber,
        source
      };

      await updateLeadDetailsAction(lead.id, payload);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Edit Lead (Parent/Contact)</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">First Name *</label>
            <Input 
              value={firstName} 
              onChange={e => setFirstName(e.target.value)} 
              placeholder="First name"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Last Name</label>
            <Input 
              value={lastName} 
              onChange={e => setLastName(e.target.value)} 
              placeholder="Last name"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <PhoneInput
              label="Primary Phone *"
              required
              value={primaryPhone}
              onChange={v => setPrimaryPhone(v)}
            />
          </div>
          <div className="space-y-2">
            <PhoneInput
              label="WhatsApp Number"
              value={whatsappNumber}
              onChange={v => setWhatsappNumber(v)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <PhoneInput
              label="Alternative Phone 1"
              value={altPhone1}
              onChange={v => setAltPhone1(v)}
            />
          </div>
          <div className="space-y-2">
            <PhoneInput
              label="Alternative Phone 2"
              value={altPhone2}
              onChange={v => setAltPhone2(v)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Lead Source</label>
          <Select 
            value={source} 
            onChange={e => setSource(e.target.value)}
          >
            <option value="META_FACEBOOK">Facebook</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="GOOGLE">Google</option>
            <option value="WEBSITE">Website</option>
            <option value="REFERRAL">Referral</option>
            <option value="DIRECT">Direct</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" disabled={loading || !firstName.trim() || !primaryPhone.trim()}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
