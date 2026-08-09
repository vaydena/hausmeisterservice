import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
  primary: 'bg-[var(--color-accent)] text-[var(--color-primary)]',
  success:
    'bg-[color-mix(in_srgb,var(--color-success)_18%,transparent)] text-[var(--color-success)]',
  warning:
    'bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]',
  danger:
    'bg-[color-mix(in_srgb,var(--color-destructive)_18%,transparent)] text-[var(--color-destructive)]',
  muted: 'bg-transparent text-[var(--color-muted-foreground)]',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
