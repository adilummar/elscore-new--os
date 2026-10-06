import * as React from 'react';
import { List } from 'lucide-react';

export function BulletNoteField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [bulletMode, setBulletMode] = React.useState(false);

  const toggleBullet = () => {
    if (!bulletMode) {
      const converted = value
        .split('\n')
        .map(line => line.trim() ? (line.startsWith('• ') ? line : `• ${line}`) : line)
        .join('\n');
      onChange(converted || '• ');
      setBulletMode(true);
    } else {
      const stripped = value.split('\n').map(l => l.replace(/^•\s?/, '')).join('\n');
      onChange(stripped);
      setBulletMode(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!bulletMode) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onChange(value + '\n• ');
    }
    if (e.key === 'Backspace') {
      const lines = value.split('\n');
      const last = lines[lines.length - 1];
      if (last === '• ') {
        e.preventDefault();
        lines.pop();
        onChange(lines.join('\n'));
      }
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-700">{label}</label>
        <button
          type="button"
          onClick={toggleBullet}
          title={bulletMode ? 'Switch to plain text' : 'Switch to bullet points'}
          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors ${
            bulletMode
              ? 'bg-brand-100 text-brand-700 border-brand-300'
              : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300 hover:text-brand-600'
          }`}
        >
          <List className="w-3 h-3" />
          {bulletMode ? 'Bullets ON' : 'Bullets'}
        </button>
      </div>
      <textarea
        rows={3}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={bulletMode ? '• Type here, Enter for new bullet…' : (placeholder ?? 'Add notes here…')}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-y min-h-[72px] transition"
      />
    </div>
  );
}
