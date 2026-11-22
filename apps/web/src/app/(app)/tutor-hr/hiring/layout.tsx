import { ReactNode } from 'react';
import { HiringSubNav } from './_components/HiringSubNav';

export default function HiringLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <HiringSubNav />
      {children}
    </div>
  );
}
