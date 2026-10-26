import * as React from 'react';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>
    </div>
  );
}
