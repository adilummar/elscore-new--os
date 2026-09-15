import * as React from 'react';
import { Bell, Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';

import { BackButton } from '@/components/ui/BackButton';

export function TopHeader({ user }: { user: any }) {
  return (
    <header className="h-16 bg-surface border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex-1 max-w-md flex items-center">
        <BackButton />
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search leads, parents..." 
            className="pl-9 bg-slate-50 border-slate-200 h-9"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="text-slate-400 hover:text-slate-600 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-slate-900 leading-none">{user?.email}</p>
            <p className="text-xs text-slate-500 mt-1">{user?.roles?.join(', ') || 'User'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}