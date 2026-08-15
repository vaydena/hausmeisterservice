import { cn } from '@/lib/utils/cn';

/**
 * Sprint 97: Zeichen-Zaehler fuer laengere Freitext-Felder, extrahiert aus
 * dem Portal-Nachrichten-Formular (Sprint 96). Rein praesentational — der
 * aufrufende Client-Component haelt den State und reicht die aktuelle
 * Laenge herein.
 *
 * Hintergrund: Alle Freitext-Felder haben serverseitige Zod-Caps, aber ein
 * textarea mit maxLength schneidet stillschweigend ab. Ohne sichtbaren
 * Zaehler merkt der Nutzer erst beim Absenden — oder gar nicht —, dass sein
 * Text gekuerzt wurde. Das trifft Bewohner haerter als Staff, weil sie
 * seltener im System sind und laengere Anliegen am Stueck tippen.
 *
 * Schwellen relativ statt absolut, damit derselbe Component fuer 2000er-
 * (Meldungs-Beschreibung) und 4000er-Felder (Nachrichten) passt.
 *
 * Bewusst ein <span>, kein <p>: im Meldungs-Formular sitzt der Zaehler
 * innerhalb eines <label>-Wrappers, und ein <p> darin waere ungueltiges
 * Markup (der Browser wuerde den umgebenden Inline-Container schliessen).
 */
const WARN_RATIO = 0.9;
const HARD_WARN_RATIO = 0.975;

export function CharCounter({
  length,
  max,
  id,
  className,
}: {
  length: number;
  max: number;
  id?: string;
  className?: string;
}) {
  const ratio = max > 0 ? length / max : 0;
  const tone =
    ratio >= HARD_WARN_RATIO
      ? 'text-[var(--color-destructive)]'
      : ratio >= WARN_RATIO
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-muted-foreground)]';

  return (
    <span id={id} className={cn('text-xs tabular-nums', tone, className)}>
      {length} / {max} Zeichen
    </span>
  );
}
