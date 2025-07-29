import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'gradient';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', children, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
          {
            'bg-slate-800 text-slate-50 hover:bg-slate-800/80 shadow-lg': variant === 'default',
            'bg-red-600 text-slate-50 hover:bg-red-700 shadow-lg': variant === 'destructive',
            'border border-slate-700 bg-transparent hover:bg-slate-800/50 hover:text-slate-50': variant === 'outline',
            'bg-slate-700 text-slate-50 hover:bg-slate-700/80': variant === 'secondary',
            'hover:bg-slate-800/50 hover:text-slate-50': variant === 'ghost',
            'text-cyan-400 underline-offset-4 hover:underline hover:text-cyan-300': variant === 'link',
            'bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-600 text-white hover:from-cyan-700 hover:via-teal-700 hover:to-cyan-700 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105': variant === 'gradient',
          },
          {
            'h-10 px-4 py-2': size === 'default',
            'h-9 rounded-lg px-3': size === 'sm',
            'h-11 rounded-xl px-8': size === 'lg',
            'h-10 w-10': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button }; 