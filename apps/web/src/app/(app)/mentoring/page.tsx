import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/auth';

import { landingPath } from './shell-view';

/** Mentoring opens on Classes, the daily workspace. Someone with no student access lands on the first area they do have. */
export default async function MentoringHome() {
  const user = await getSession();
  const can = (p: string) => !!user?.permissions?.includes(p);
  const target = landingPath(can);
  if (target) redirect(target);
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-slate-500">You do not have access to any Mentoring area.</p>
    </div>
  );
}
