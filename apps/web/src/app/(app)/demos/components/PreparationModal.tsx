'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { savePreparation } from '../actions';
import { BookOpen, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PreparationModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function PreparationModal({ isOpen, onClose, demo, onSuccess }: PreparationModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (demo && isOpen) {
      setNotes(demo.preparationNotes || demo.booking?.preparationNotes || '');
      setError(null);
    }
  }, [demo, isOpen]);

  const charCount = notes.trim().length;
  const isValid = charCount >= 15;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setError('Preparation notes must be at least 15 characters long.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const demoId = demo.booking?.id || demo.id;
    const res = await savePreparation(demoId, { preparationNotes: notes.trim() });
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to save preparation guidelines');
    } else {
      onSuccess();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Demo Preparation Guidelines
            </h3>
            <p className="text-xs text-slate-500">
              Provide &ldquo;How to take the class&rdquo; instructions for the tutor and student
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                How to Take the Class (Mandatory)
              </label>
              <span className={`text-xs ${isValid ? 'text-emerald-600' : 'text-slate-400'}`}>
                {charCount} / 15 min chars
              </span>
            </div>
            <textarea
              rows={5}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Student needs assistance on Calculus Chapter 3. Please use digital whiteboard, ask student to keep webcam enabled, and follow interactive problem-solving format..."
              className="w-full text-sm rounded-lg border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">
              {isValid ? (
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Requirement satisfied
                </span>
              ) : (
                'Must be at least 15 characters before tutor can be assigned.'
              )}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !isValid}>
              {isLoading ? 'Saving...' : 'Save Preparation Notes'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
