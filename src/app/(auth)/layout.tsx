import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-muted)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold text-lg">
            HS
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Hausmeister App</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Objekt- und Hausmeisterservice-Verwaltung
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
