'use client';

import {
  deleteAutomationRuleAction,
  resetAutomationRuleDispatchesAction,
  sendTestEmailFromRuleAction,
  testRunAutomationRuleAction,
  toggleAutomationRuleAction,
} from '../actions';

export function RuleAdminBar({
  id,
  enabled,
  dispatchCount,
  actionKey,
}: {
  id: string;
  enabled: boolean;
  dispatchCount: number;
  actionKey: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-3 text-sm">
      <form action={toggleAutomationRuleAction} className="contents">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
        >
          {enabled ? 'Deaktivieren' : 'Aktivieren'}
        </button>
      </form>

      <form action={testRunAutomationRuleAction} className="contents">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
        >
          Jetzt ausführen (Testlauf)
        </button>
      </form>

      {actionKey === 'send_email' && (
        <form
          action={sendTestEmailFromRuleAction}
          className="contents"
          onSubmit={(e) => {
            const msg =
              'Testmail an Ihre eigene E-Mail-Adresse senden? ' +
              'Umgeht Trigger und Dispatch-Historie. Nutzt den konfigurierten E-Mail-Provider.';
            if (!confirm(msg)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            title="Testmail an eigene Adresse — prüft E-Mail-Zustellung ohne Trigger auszulösen."
          >
            Testmail an mich senden
          </button>
        </form>
      )}

      <form
        action={resetAutomationRuleDispatchesAction}
        className="contents"
        onSubmit={(e) => {
          if (dispatchCount === 0) {
            e.preventDefault();
            return;
          }
          const msg =
            `Dispatch-Historie zurücksetzen? ${dispatchCount} Einträge werden gelöscht. ` +
            'Beim nächsten Lauf triggern alle passenden Vorgänge erneut — Doppel-Benachrichtigungen möglich.';
          if (!confirm(msg)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={dispatchCount === 0}
          className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-medium hover:bg-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
          title={
            dispatchCount === 0
              ? 'Keine Dispatches vorhanden.'
              : `${dispatchCount} Dispatches löschen`
          }
        >
          Dispatches zurücksetzen
        </button>
      </form>

      <form
        action={deleteAutomationRuleAction}
        className="ml-auto contents"
        onSubmit={(e) => {
          if (!confirm('Regel wirklich löschen? Bereits protokollierte Läufe werden entfernt.')) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-[var(--color-destructive)] px-3 text-sm font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
        >
          Löschen
        </button>
      </form>
    </div>
  );
}
