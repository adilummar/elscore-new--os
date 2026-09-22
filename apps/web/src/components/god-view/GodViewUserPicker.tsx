"use client";

import * as React from 'react';
import { Eye, Search, ChevronRight, X } from 'lucide-react';
import { enterGodViewAction } from '@/app/(app)/god-view/actions';
import { useRouter } from 'next/navigation';

interface GodViewUser {
  id: string;
  email: string;
  status: string;
  employee?: { firstName: string; lastName: string } | null;
  userRoles?: { role: { code: string; name: string } }[];
}

interface GodViewUserPickerProps {
  isOpen: boolean;
  onClose: () => void;
  users: GodViewUser[];
}

const roleColors: Record<string, string> = {
  CEO: 'bg-purple-100 text-purple-700',
  SALES_HEAD: 'bg-blue-100 text-blue-700',
  SALES_COUNSELLOR: 'bg-green-100 text-green-700',
  PERFORMANCE_MARKETER: 'bg-orange-100 text-orange-700',
  HR_MANAGER: 'bg-rose-100 text-rose-700',
  DEFAULT: 'bg-slate-100 text-slate-600',
};

export function GodViewUserPicker({ isOpen, onClose, users }: GodViewUserPickerProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [filterRole, setFilterRole] = React.useState<string>('ALL');

  const filtered = React.useMemo(() => {
    let result = users;

    // 1. Filter by role category
    if (filterRole !== 'ALL') {
      result = result.filter(u => {
        const roles = u.userRoles?.map(r => r.role.code) || [];
        switch (filterRole) {
          case 'SALES': return roles.some(r => r.includes('SALES'));
          case 'ACADEMICS': return roles.some(r => r.includes('ACADEMIC') || r === 'TUTOR' || r === 'MENTOR');
          case 'MARKETING': return roles.some(r => r.includes('MARKETING'));
          case 'ADMIN': return roles.some(r => r.includes('CEO') || r.includes('HR') || r.includes('MANAGER'));
          default: return true;
        }
      });
    }

    // 2. Filter by search text
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(u => {
        const name = u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : '';
        return (
          name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.userRoles?.some(r => r.role.code.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [users, search, filterRole]);

  const handleEnter = async (user: GodViewUser) => {
    setLoading(user.id);
    setError(null);
    const result = await enterGodViewAction(user.id);
    if (result.error) {
      setError(result.error);
      setLoading(null);
      return;
    }
    router.refresh();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <Eye className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">God View</h2>
              <p className="text-xs text-slate-500">Select a user to view their perspective</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="px-4 py-3 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              placeholder="Search by name, email, or role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {['ALL', 'SALES', 'ACADEMICS', 'MARKETING', 'ADMIN'].map(role => (
              <button
                key={role}
                onClick={() => setFilterRole(role)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  filterRole === role
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {role === 'ALL' ? 'All Users' : role}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg">
            {error}
          </div>
        )}

        {/* User list */}
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-50 py-2">
          {filtered.length === 0 && (
            <li className="px-6 py-8 text-center text-sm text-slate-400">No users found</li>
          )}
          {filtered.map(user => {
            const name = user.employee
              ? `${user.employee.firstName} ${user.employee.lastName}`
              : null;
            const primaryRole = user.userRoles?.[0]?.role?.code ?? 'USER';
            const colorClass = roleColors[primaryRole] ?? roleColors.DEFAULT;
            const isLoading = loading === user.id;

            return (
              <li key={user.id}>
                <button
                  onClick={() => handleEnter(user)}
                  disabled={!!loading}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-amber-50 transition-colors text-left disabled:opacity-60 group"
                >
                  {/* Avatar */}
                  <div className="shrink-0 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-600 text-sm">
                    {(name ?? user.email).charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {name && (
                        <span className="text-sm font-semibold text-slate-900 truncate">{name}</span>
                      )}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colorClass}`}>
                        {primaryRole.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 truncate block">{user.email}</span>
                  </div>

                  {/* Arrow / loading */}
                  {isLoading ? (
                    <div className="shrink-0 w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ChevronRight className="shrink-0 w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
          All God View sessions are logged to the audit trail.
        </div>
      </div>
    </div>
  );
}
