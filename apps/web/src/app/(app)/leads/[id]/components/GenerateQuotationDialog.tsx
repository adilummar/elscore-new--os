"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export function GenerateQuotationDialog({
  student,
  isOpen,
  onClose,
  onSuccess
}: {
  student: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (quotationId: string) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [offerRate, setOfferRate] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/quotations/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId: student.id,
          offerHourlyRate: offerRate ? Number(offerRate) : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to generate quotation');
      }

      const data = await res.json();
      onSuccess(data.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Generate Quotation</h2>
      
      <div className="mb-4">
        <p className="text-sm font-medium">Student: {student?.firstName} {student?.lastName}</p>
        <p className="text-sm text-slate-500">Curriculum: {student?.curriculum?.name} | Grade: {student?.grade?.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Special Offer Hourly Rate (AED) - Optional</label>
          <input
            type="number"
            className="w-full p-2 border border-slate-200 rounded-md text-sm"
            value={offerRate}
            onChange={e => setOfferRate(e.target.value)}
            placeholder="Leave blank for normal pricing"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Generating...' : 'Generate Quotation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
