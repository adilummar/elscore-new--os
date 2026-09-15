'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

export function PeriodSelector({ currentPeriod, currentFrom, currentTo }: { currentPeriod: string; currentFrom: string; currentTo: string }) {
  const router = useRouter();

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      // For V1, we simply alert or we could build a date picker.
      alert('Custom date picker to be implemented. Please use predefined periods.');
      return;
    }
    router.push(`/dashboard/ceo?period=${val}`);
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm font-medium text-slate-300">Period:</span>
      <select
        className="bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
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
