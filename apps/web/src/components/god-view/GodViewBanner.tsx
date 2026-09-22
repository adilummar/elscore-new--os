"use client";

import * as React from 'react';
import { Eye, X, AlertTriangle } from 'lucide-react';
import { exitGodViewAction } from '@/app/(app)/god-view/actions';
import { useRouter } from 'next/navigation';

interface GodViewBannerProps {
  targetUser: {
    id: string;
    email: string;
    displayName?: string;
    roles: string[];
  };
  canAct: boolean; // true = CEO (can make changes), false = read-only
}

export function GodViewBanner({ targetUser, canAct }: GodViewBannerProps) {
  const router = useRouter();
  const [exiting, setExiting] = React.useState(false);

  const handleExit = async () => {
    setExiting(true);
    await exitGodViewAction();
    router.refresh();
    router.push('/dashboard');
  };

  const displayName = targetUser.displayName || targetUser.email;
  const roleLabel = targetUser.roles?.[0]?.replace(/_/g, ' ') || 'User';

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-11 gap-4">
          {/* Left: icon + label */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-7 h-7 rounded-full bg-amber-950/10 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold truncate">
              <span className="uppercase tracking-wider text-xs font-bold opacity-70">
                God View
              </span>
              <span className="opacity-40">•</span>
              <span className="truncate">
                Viewing as <strong>{displayName}</strong>
              </span>
              <span className="hidden sm:inline-flex items-center rounded-full bg-amber-950/10 px-2 py-0.5 text-xs font-medium">
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Center: read-only warning */}
          {!canAct && (
            <div className="hidden md:flex items-center gap-1.5 text-xs font-medium opacity-75 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              Read-only — actions are disabled
            </div>
          )}
          {canAct && (
            <div className="hidden md:flex items-center gap-1.5 text-xs font-medium opacity-75 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              CEO mode — actions will be logged under your identity
            </div>
          )}

          {/* Right: exit */}
          <button
            onClick={handleExit}
            disabled={exiting}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-950/15 hover:bg-amber-950/25 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            {exiting ? 'Exiting…' : 'Exit God View'}
          </button>
        </div>
      </div>
    </div>
  );
}
