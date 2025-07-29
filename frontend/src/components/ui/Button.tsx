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
          'inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] font-[family-name:var(--font-unbounded)]',
          {
            'bg-neutral-900/60 text-neutral-50 hover:bg-neutral-800/80 shadow-lg border border-neutral-700/50 backdrop-blur-sm': variant === 'default',
            'bg-red-600 text-neutral-50 hover:bg-red-700 shadow-lg': variant === 'destructive',
            'border border-neutral-600/50 bg-transparent hover:bg-neutral-800/30 hover:text-neutral-50 backdrop-blur-sm': variant === 'outline',
            'bg-neutral-800/50 text-neutral-50 hover:bg-neutral-700/60 backdrop-blur-sm': variant === 'secondary',
            'hover:bg-neutral-800/30 hover:text-neutral-50': variant === 'ghost',
            'text-orange-400 underline-offset-4 hover:underline hover:text-orange-300': variant === 'link',
            'bg-gradient-to-r from-orange-600 via-red-600 to-orange-500 text-white hover:from-orange-700 hover:via-red-700 hover:to-orange-600 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105': variant === 'gradient',
          },
          {
            'h-10 px-4 py-2': size === 'default',
            'h-9 rounded-lg px-3 text-xs': size === 'sm',
            'h-12 rounded-2xl px-8 text-base': size === 'lg',
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