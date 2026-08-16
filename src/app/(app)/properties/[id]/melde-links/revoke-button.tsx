'use client';

import { useState } from 'react';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { revokeReportLinkAction } from './actions';

/**
 * Zwei Klicks statt einem. Abschalten ist nicht rueckgaengig zu machen — der
 * Aushang im Treppenhaus wird dadurch zu totem Papier und muss ersetzt
 * werden. Ein versehentlicher Klick kostet also einen Gang durchs Haus.
 */
export function RevokeReportLinkButton({
  propertyId,
  linkId,
}: {
  propertyId: string;
  linkId: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <Ban className="size-4" aria-hidden />
        Abschalten
      </Button>
    );
  }

  return (
    <form action={revokeReportLinkAction.bind(null, propertyId)} className="flex items-center gap-2">
      <input type="hidden" name="id" value={linkId} />
      <span className="text-xs text-[var(--color-muted-foreground)]">
        Aushang wird ungültig —
      </span>
      <Button type="submit" variant="destructive" size="sm">
        wirklich abschalten
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Abbrechen
      </Button>
    </form>
  );
}
