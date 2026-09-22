import * as React from 'react';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { getSession } from '@/lib/api/auth';
import { redirect } from 'next/navigation';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { GodViewBanner } from '@/components/god-view/GodViewBanner';
import { getGodViewProfile } from '@/app/(app)/god-view/actions';
import { fetchApi } from '@/lib/api/client';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getSession() will fetch /auth/me WITH the X-God-View-Target header if active.
  // This means `effectiveUser` will naturally be the target user!
  const effectiveUser = await getSession();
  
  if (!effectiveUser) {
    redirect('/login');
  }

  // ── God View ───────────────────────────────────────────────────────────────
  const cookieStore = cookies();
  const godViewUserId = cookieStore.get('godViewUserId')?.value;

  let realUser = effectiveUser;
  let allUsers: any[] = [];

  // If God View is active, we need to fetch the real user to render the banner correctly.
  if (godViewUserId) {
    try {
      realUser = await fetchApi<any>('/auth/me', { skipGodView: true });
    } catch {
      // If we can't fetch the real user, they might be logged out.
    }
  }

  const isCeo = realUser?.permissions?.includes('analytics.ceo.read');
  const canEnterGodView = isCeo || realUser?.permissions?.includes('god-view.enter');

  // Pre-load all users for the God View picker (CEO/Admin only)
  if (canEnterGodView) {
    try {
      const usersRes = await fetchApi<any>('/auth/god-view/users', { skipGodView: true });
      allUsers = usersRes ?? [];
    } catch {
      allUsers = [];
    }
  }

  const canActInGodView = godViewUserId && isCeo;

  return (
    <AuthProvider user={realUser} godViewUser={godViewUserId ? effectiveUser : null} allUsers={allUsers}>
      <div className="flex h-screen bg-background flex-col overflow-hidden">
        {/* God View Banner — sticky at very top, above sidebar */}
        {godViewUserId && (
          <GodViewBanner
            targetUser={effectiveUser}
            canAct={!!canActInGodView}
          />
        )}
        <div className="flex flex-1 min-h-0">
          <Sidebar user={effectiveUser} />
          <div className="flex-1 flex flex-col min-w-0">
            <TopHeader user={realUser} />
            <main className="flex-1 overflow-auto p-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </AuthProvider>
  );
}