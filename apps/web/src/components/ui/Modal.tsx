import * as React from 'react';
import { X } from 'lucide-react';

export function Modal({ isOpen, onClose, children, size = 'md' }: { isOpen: boolean, onClose: () => void, children: React.ReactNode, size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} p-6 relative flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}