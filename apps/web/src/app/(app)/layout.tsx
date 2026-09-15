import * as React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { getSession } from '@/lib/api/auth';
import { redirect } from 'next/navigation';
import { AuthProvider } from '@/components/providers/AuthProvider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  
  if (!user) {
    redirect('/login');
  }

  return (
    <AuthProvider user={user}>
      <div className="flex min-h-screen bg-background">
        <Sidebar user={user} />
        <div className="flex-1 flex flex-col">
          <TopHeader user={user} />
          <main className="flex-1 overflow-auto p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}