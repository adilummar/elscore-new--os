import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { ComplaintsWorkspaceClient } from './ComplaintsWorkspaceClient';

export default async function MentoringComplaintsPage() {
  const user = await getSession();
  const canHandle = !!user?.permissions?.includes('mentoring.complaint.handle');
  const canWork = !!user?.permissions?.includes('mentoring.stage.work');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Complaints Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            Parent complaints logged and handled on behalf of assigned students. The 2-hour target applies to acknowledgement.
          </p>
        </div>
      </header>

      <ComplaintsWorkspaceClient canHandle={canHandle || canWork} />
    </div>
  );
}
