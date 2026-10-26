import * as React from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl' | '6xl' | 'full';
  className?: string;
  contentClassName?: string;
}

export function Modal({
  isOpen,
  onClose,
  children,
  size = 'md',
  className = '',
  contentClassName,
}: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
    '5xl': 'w-full sm:w-[88vw] md:w-[82vw] max-w-5xl',
    '6xl': 'w-full sm:w-[92vw] md:w-[85vw] lg:w-[80vw] max-w-[1150px]',
    full: 'max-w-full m-2 sm:m-4',
  };

  const hasPadding = !className.includes('p-0');

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6"
      onClick={onClose}
    >
      <div 
        className={`bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full ${sizeClasses[size] || sizeClasses.md} ${hasPadding ? 'p-6' : ''} relative flex flex-col max-h-[92vh] md:max-h-[85vh] overflow-hidden ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors z-20 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Close"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>
        <div className={contentClassName !== undefined ? contentClassName : "overflow-y-auto"}>
          {children}
        </div>
      </div>
    </div>
  );
}