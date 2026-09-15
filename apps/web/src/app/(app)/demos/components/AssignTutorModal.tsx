'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { assignTutor, searchTutors } from '../actions';

interface AssignTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function AssignTutorModal({ isOpen, onClose, demo, onSuccess }: AssignTutorModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<any[]>([]);
  const [selectedTutor, setSelectedTutor] = React.useState<any | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.length > 2 && !selectedTutor) {
        try {
          const res = await searchTutors(search);
          setResults(res.data || []);
        } catch (e) {
          console.error(e);
        }
      } else {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedTutor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTutor) return;
    
    setIsLoading(true);
    try {
      await assignTutor(demo.id, selectedTutor.id);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to assign tutor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Assign Tutor</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm mb-4">
          <p className="font-medium text-slate-700">
            {demo?.subject?.name} - {demo?.grade?.name}
          </p>
          <p className="text-slate-500 mt-1">
            {demo?.scheduledAt ? new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(demo.scheduledAt)) : ''}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Search Tutor</label>
          {!selectedTutor ? (
            <div className="relative">
              <Input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name..."
              />
              {results.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                  {results.map((tutor) => (
                    <button
                      key={tutor.id}
                      type="button"
                      className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50"
                      onClick={() => setSelectedTutor(tutor)}
                    >
                      <div className="font-medium text-slate-900">{tutor.firstName} {tutor.lastName}</div>
                      <div className="text-slate-500 text-xs">{tutor.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div>
                <div className="text-sm font-medium text-slate-900">{selectedTutor.firstName} {selectedTutor.lastName}</div>
              </div>
              <button 
                type="button" 
                onClick={() => { setSelectedTutor(null); setSearch(''); }}
                className="text-xs text-red-600 hover:text-red-700 font-medium"
              >
                Change
              </button>
            </div>
          )}
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={!selectedTutor}>
            Assign Tutor
          </Button>
        </div>
      </form>
    </Modal>
  );
}
