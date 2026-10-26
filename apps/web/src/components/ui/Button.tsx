import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm border border-transparent focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
      secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
      outline: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700',
      ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm border border-transparent focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
    };
    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 py-2 text-sm',
      lg: 'h-12 px-6 text-base',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
