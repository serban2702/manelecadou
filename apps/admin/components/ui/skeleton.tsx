'use client';

import { cn } from '@/lib/cn';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-secondary/60 relative overflow-hidden',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
