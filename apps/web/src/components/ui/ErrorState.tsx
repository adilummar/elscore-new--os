import * as React from 'react';

export function ErrorState({ title = "Error", description }: { title?: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-red-600 dark:text-red-400">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-red-500 dark:text-red-300 max-w-sm">{description}</p>
    </div>
  );
}
