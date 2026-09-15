import * as React from 'react';
import { cn } from '@/lib/utils';
export function Alert({ children, variant = 'info', className }: { children: React.ReactNode, variant?: 'info' | 'error' | 'success', className?: string }) { return <div className={cn("p-4 rounded-md", variant === 'error' ? 'bg-red-50 text-red-900' : 'bg-blue-50 text-blue-900', className)}>{children}</div>; }