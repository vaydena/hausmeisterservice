'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export function ExportDataButton() {
  const [pending, setPending] = useState(false);

  async function handleDownload() {
    setPending(true);
    try {
      const res = await fetch('/api/privacy/export', {
        method: 'GET',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        throw new Error(`Export fehlgeschlagen (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? 'datenauskunft.json';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Wird vorbereitet…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" aria-hidden />
          Datenauskunft herunterladen (JSON)
        </>
      )}
    </button>
  );
}
