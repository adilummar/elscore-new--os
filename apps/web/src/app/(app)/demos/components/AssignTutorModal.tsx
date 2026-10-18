'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Sparkles, Check, User, Clock } from 'lucide-react';
import { assignTutor, searchTutors, getTutorSuggestions } from '../actions';

interface AssignTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function AssignTutorModal({ isOpen, onClose, demo, onSuccess }: AssignTutorModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<any[]>([]);

  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<any[]>([]);
  const [selectedTutor, setSelectedTutor] = React.useState<any | null>(null);

  React.useEffect(() => {
    if (isOpen && demo?.id) {
      setSuggestionsLoading(true);
      getTutorSuggestions(demo.id)
        .then((res) => {
          setSuggestions(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
        })
        .catch((e) => {
          console.error('Failed to load tutor suggestions', e);
          setSuggestions([]);
        })
        .finally(() => setSuggestionsLoading(false));
    } else {
      setSuggestions([]);
      setSelectedTutor(null);
      setSearch('');
    }
  }, [isOpen, demo?.id]);

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.length > 1 && !selectedTutor) {
        try {
          const res = await searchTutors(search);
          const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          setResults(list);
        } catch (e) {
          console.error(e);
        }
      } else {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedTutor]);

  const handleAssign = async (tutorId: string) => {
    setIsLoading(true);
    try {
      await assignTutor(demo.id, tutorId);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to assign tutor');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTutor) return;
    await handleAssign(selectedTutor.id);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-3">Assign Tutor</h2>
      
      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm mb-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-800">
            {demo?.subject?.name || 'Subject'} - {demo?.grade?.name || 'Grade'}
          </p>
          {demo?.curriculum?.name && (
            <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
              {demo.curriculum.name}
            </span>
          )}
        </div>
        <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {demo?.scheduledAt ? new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(demo.scheduledAt)) : ''}
        </p>
      </div>

      <div className="space-y-4">
        {/* Automatic Suggestions Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-500" />
              Recommended Tutors
            </span>
            {suggestionsLoading && <span className="text-xs text-slate-400">Finding matches...</span>}
          </div>

          {suggestions.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {suggestions.slice(0, 4).map((tutor) => (
                <div
                  key={tutor.id}
                  className="p-2.5 bg-white border border-slate-200 hover:border-brand-300 rounded-lg flex items-center justify-between gap-3 text-sm transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 truncate">
                        {tutor.firstName} {tutor.lastName || tutor.email}
                      </span>
                      {tutor.score > 0 && (
                        <span className="text-[10px] bg-brand-50 text-brand-700 font-semibold px-1.5 py-0.2 rounded border border-brand-200">
                          {tutor.score}% Match
                        </span>
                      )}
                    </div>
                    {tutor.matchReasons && tutor.matchReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tutor.matchReasons.map((reason: string, rIdx: number) => (
                          <span key={rIdx} className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-brand-600 text-brand-600 hover:bg-brand-50 text-xs shrink-0"
                    isLoading={isLoading}
                    onClick={() => handleAssign(tutor.id)}
                  >
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          ) : !suggestionsLoading ? (
            <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              No automatic suggestions available for this time slot. Use manual search below.
            </p>
          ) : null}
        </div>

        {/* Manual Search Section */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Or Search All Tutors
          </label>
          {!selectedTutor ? (
            <div className="relative">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type name or email to search..."
              />
              {results.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                  {results.map((tutor) => (
                    <button
                      key={tutor.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 border-b border-slate-50 last:border-b-0"
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
                <div className="text-xs text-slate-500">{selectedTutor.email}</div>
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
      </div>

      <div className="pt-5 flex justify-end gap-3 border-t border-slate-100 mt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          isLoading={isLoading}
          disabled={!selectedTutor}
          onClick={handleSubmit}
        >
          Assign Selected Tutor
        </Button>
      </div>
    </Modal>
  );
}
