"use client";

import * as React from 'react';
import { Bell, Eye } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { useAuth } from '@/components/providers/AuthProvider';

export function TopHeader({ user }: { user: any }) {
  const { isInGodView, godViewUser, openGodViewPicker } = useAuth();

  // Show God View button only to CEO as requested
  const canEnterGodView = user?.roles?.includes('CEO');

  return (
    <header className="h-16 bg-surface border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex-1 max-w-md flex items-center">
        <BackButton />
      </div>
      <div className="flex items-center gap-3">
        {/* God View button — only for CEO/Admin, not while already in God View */}
        {canEnterGodView && !isInGodView && (
          <button
            onClick={openGodViewPicker}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
            title="Enter God View — see the app as any user"
          >
            <Eye className="w-3.5 h-3.5" />
            God View
          </button>
        )}

        <button className="text-slate-400 hover:text-slate-600 transition-colors">
          <Bell className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-slate-900 leading-none">{user?.email}</p>
            <p className="text-xs text-slate-500 mt-1">
              {isInGodView
                ? <span className="text-amber-600 font-semibold">God View active</span>
                : (user?.roles?.join(', ') || 'User')}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}