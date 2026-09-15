'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { completeDemo } from '../actions';

interface CompleteDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function CompleteDemoModal({ isOpen, onClose, demo, onSuccess }: CompleteDemoModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [rating, setRating] = React.useState('5');
  const [comments, setComments] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await completeDemo(demo.id, { 
        rating: parseInt(rating, 10), 
        comments 
      });
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to complete demo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Complete Demo</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-sm mb-4">
          <p className="font-medium">
            Demo Details
          </p>
          <ul className="mt-2 space-y-1 text-emerald-700">
            <li><strong>Student:</strong> {demo?.student?.firstName} {demo?.student?.lastName}</li>
            <li><strong>Subject:</strong> {demo?.subject?.name}</li>
            <li><strong>Tutor:</strong> {demo?.tutor?.firstName} {demo?.tutor?.lastName}</li>
          </ul>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rating</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRating(r.toString())}
                className={`flex-1 py-2 text-center rounded-md border ${
                  rating === r.toString()
                    ? 'bg-amber-100 border-amber-400 text-amber-700 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {r} ⭐
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Feedback</label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
            rows={4}
            required
            placeholder="Detailed feedback about the demo..."
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Submit Completion
          </Button>
        </div>
      </form>
    </Modal>
  );
}
