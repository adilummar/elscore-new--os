'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function PeriodSelector({
  currentPeriod,
  currentFrom,
  currentTo,
  className,
}: {
  currentPeriod: string;
  currentFrom: string;
  currentTo: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      alert('Custom date picker to be implemented. Please use predefined periods.');
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('period', val);
    params.delete('from');
    params.delete('to');
    const targetPath = pathname || '/dashboard/ceo';
    router.push(`${targetPath}?${params.toString()}`);
  };

  return (
    <div className={`flex items-center space-x-2 ${className || ''}`}>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Period:</span>
      <select
        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2.5 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-brand-500 shadow-xs cursor-pointer"
        value={currentFrom ? 'custom' : currentPeriod}
        onChange={handlePeriodChange}
      >
        <option value="today">Today</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="custom">Custom...</option>
      </select>
    </div>
  );
}

