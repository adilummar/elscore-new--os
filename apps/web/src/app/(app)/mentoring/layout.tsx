import * as React from 'react';

import { MentoringShell } from './MentoringShell';

export default function MentoringLayout({ children }: { children: React.ReactNode }) {
  return <MentoringShell>{children}</MentoringShell>;
}
