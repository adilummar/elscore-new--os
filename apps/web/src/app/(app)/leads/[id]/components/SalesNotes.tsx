"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createNoteAction, deleteNoteAction } from '../../actions';
import { usePermissions } from '@/components/providers/AuthProvider';

export function SalesNotes({ leadId, initialNotes }: { leadId: string, initialNotes: any[] }) {
  const [notes, setNotes] = React.useState<any[]>(initialNotes || []);
  const [newNote, setNewNote] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const { hasPermission } = usePermissions();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setLoading(true);
    try {
      const res = await createNoteAction(leadId, newNote);
      // Fetch fresh notes or append (appending a stub here for simplicity, ideally reload from server)
      setNotes([res, ...notes]);
      setNewNote('');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      await deleteNoteAction(leadId, noteId);
      setNotes(notes.filter(n => n.id !== noteId));
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Sales Notes</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {hasPermission('salesnote.create') && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Type a working note..." />
            <Button type="submit" disabled={loading || !newNote.trim()}>Add</Button>
          </form>
        )}
        <div className="space-y-3 mt-4">
          {notes.map(note => (
            <div key={note.id} className="p-3 bg-slate-50 rounded-md border border-slate-100">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                <span>{new Date(note.createdAt).toLocaleString()}</span>
                {hasPermission('salesnote.delete') && <button onClick={() => handleDelete(note.id)} className="text-red-400 hover:text-red-600">Delete</button>}
              </div>
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No notes yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
