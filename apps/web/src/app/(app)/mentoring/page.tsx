import Link from 'next/link';
import { getSession } from '@/lib/api/auth';

export default async function MentoringHome() {
  const user = await getSession();
  const can = (p: string) => !!user?.permissions?.includes(p);

  const links = [
    { href: '/mentoring/students', label: 'Students', show: can('mentoring.student.read-all') || can('mentoring.student.read-assigned') },
    { href: '/mentoring/tasks', label: 'Tasks', show: can('mentoring.task.work') || can('mentoring.task.create') },
    { href: '/mentoring/allocation', label: 'Allocation and workload', show: can('mentoring.allocation.read') || can('mentoring.staff.read') },
    { href: '/mentoring/approvals', label: 'Final approvals', show: can('mentoring.approval.final') || can('mentoring.student.read-all') },
    { href: '/mentoring/staff', label: 'Mentors and Demo Counselors', show: can('mentoring.staff.read') },
  ].filter((l) => l.show);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Mentoring</h1>
      {links.length === 0 ? (
        <p className="text-slate-500">You do not have access to any Mentoring area.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg border border-slate-200 bg-white p-4 font-medium text-slate-800 hover:border-brand-500">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
