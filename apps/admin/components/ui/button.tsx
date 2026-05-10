'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-secondary hover:text-secondary-foreground',
        ghost: 'text-foreground hover:bg-secondary',
        destructive:
          'bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25',
        success:
          'bg-success/15 text-success border border-success/30 hover:bg-success/25',
        warning:
          'bg-warning/15 text-warning border border-warning/30 hover:bg-warning/25',
        link: 'text-primary underline-offset-4 hover:underline',
        accent:
          'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25',
      },
      size: {
        default: 'h-9 px-4 text-sm [&_svg]:size-4',
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        xs: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
        lg: 'h-11 px-6 text-base [&_svg]:size-5',
        icon: 'h-9 w-9 [&_svg]:size-4',
        'icon-sm': 'h-7 w-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
