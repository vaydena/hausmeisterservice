import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Paperclip, Plus, Tag } from 'lucide-react';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Meldungen · Bewohner-Portal',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Neu eingereicht',
  reviewing: 'In Prüfung',
  converted: 'In Bearbeitung',
  rejected: 'Abgelehnt',
};

const STATUS_TONE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  reviewing: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  converted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'niedrig',
  normal: 'normal',
  high: 'hoch',
  emergency: 'Notfall',
};

// Sprint 63: Bewohner-orientierte Statusgruppen. 'offen' fasst
// unbeantwortete Meldungen zusammen (aus Bewohnersicht "wartet auf
// Reaktion"), 'in_bearbeitung' entspricht status='converted' (Auftrag
// wurde erstellt), 'abgelehnt' ist rejected. 'alle' zeigt jede eigene
// Meldung unabhaengig vom Status.
const STATUS_GROUPS = {
  alle: null,
  offen: ['new', 'reviewing'],
  in_bearbeitung: ['converted'],
  abgelehnt: ['rejected'],
} satisfies Record<string, string[] | null>;

type StatusGroup = keyof typeof STATUS_GROUPS;

const GROUP_TABS: { key: StatusGroup; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'offen', label: 'Offen' },
  { key: 'in_bearbeitung', label: 'In Bearbeitung' },
  { key: 'abgelehnt', label: 'Abgelehnt' },
];

function isStatusGroup(v: string | undefined): v is StatusGroup {
  return v === 'alle' || v === 'offen' || v === 'in_bearbeitung' || v === 'abgelehnt';
}

const EMPTY_STATE_TEXT: Record<StatusGroup, string> = {
  alle: 'Sie haben bisher keine Mängel gemeldet.',
  offen: 'Aktuell warten keine Meldungen auf eine Reaktion der Hausverwaltung.',
  in_bearbeitung: 'Keine Meldungen in Bearbeitung.',
  abgelehnt: 'Keine abgelehnten Meldungen.',
};

export default async function PortalDefectsPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string; status?: string; q?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');
  const { info, status: statusParam, q: qParam } = await searchParams;
  const activeGroup: StatusGroup = isStatusGroup(statusParam) ? statusParam : 'alle';
  const groupFilter = STATUS_GROUPS[activeGroup];

  // Sprint 72: Text-Suche nach Titel oder Code. RLS filtert bereits
  // auf reporter_user_id, hier nur zusaetzliche ILIKE-Bedingung. Wildcards
  // (%/_) und PostgREST-or()-Trennzeichen (,()) aus dem Query entfernen —
  // Bewohner suchen mit normalen Woertern; Sonderzeichen sollen weder
  // als Wildcard funktionieren noch den Filterausdruck aufbrechen.
  const searchTerm = (qParam ?? '').trim();
  const searchSafe = searchTerm.replace(/[%_,()]/g, ' ').trim();

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('defect_reports')
    .select('id, code, title, priority, status, category, created_at')
    .eq('reporter_user_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (groupFilter) {
    query = query.in('status', groupFilter);
  }
  if (searchSafe.length > 0) {
    query = query.or(`title.ilike.%${searchSafe}%,code.ilike.%${searchSafe}%`);
  }
  const { data } = await query;

  const defects = data ?? [];

  // Sprint 69: Anhang-Zaehler pro Meldung als Signal fuer den Bewohner,
  // dass hochgeladene Fotos/Dokumente tatsaechlich angekommen sind.
  // Ein einzelner batch-Fetch reicht — RLS
  // (documents_select_resident_own_defect aus Sprint 55) filtert bereits
  // auf reporter_user_id = auth.uid(), daher kein zusaetzlicher WHERE
  // hier. Gruppieren client-seitig, weil PostgREST kein
  // count() group by unterstuetzt.
  const defectIds = defects.map((d) => d.id);
  const { data: attachmentRows } = defectIds.length
    ? await supabase
        .from('documents')
        .select('entity_id')
        .eq('entity_type', 'defect_report')
        .in('entity_id', defectIds)
    : { data: [] as { entity_id: string }[] };
  const attachmentCountMap = new Map<string, number>();
  for (const row of attachmentRows ?? []) {
    attachmentCountMap.set(row.entity_id, (attachmentCountMap.get(row.entity_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Meine Meldungen</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Übersicht aller von Ihnen gemeldeten Mängel.
          </p>
        </div>
        <Link
          href="/portal/defects/new"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden />
          Neue Meldung
        </Link>
      </div>

      <form method="get" action="/portal/defects" className="flex gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={searchTerm}
          placeholder="Nach Titel oder Code suchen"
          aria-label="Meldungen durchsuchen"
          className="h-9 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        {activeGroup !== 'alle' && (
          <input type="hidden" name="status" value={activeGroup} />
        )}
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
        >
          Suchen
        </button>
        {searchTerm.length > 0 && (
          <Link
            href={activeGroup === 'alle' ? '/portal/defects' : `/portal/defects?status=${activeGroup}`}
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            Zurücksetzen
          </Link>
        )}
      </form>

      <nav aria-label="Nach Status filtern" className="flex flex-wrap gap-2">
        {GROUP_TABS.map((tab) => {
          const isActive = tab.key === activeGroup;
          // Sprint 72: q bleibt beim Statuswechsel erhalten — wer nach
          // "Wasser" sucht und dann zu "Offen" wechselt, verliert seinen
          // Suchbegriff sonst und muss neu tippen.
          const qParamPart = searchTerm.length > 0 ? `q=${encodeURIComponent(searchTerm)}` : '';
          const statusParamPart = tab.key === 'alle' ? '' : `status=${tab.key}`;
          const queryString = [statusParamPart, qParamPart].filter(Boolean).join('&');
          const href = queryString ? `/portal/defects?${queryString}` : '/portal/defects';
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                isActive
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {info === 'withdrawn' && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-4 text-sm"
        >
          <p className="font-medium">Meldung zurückgezogen.</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Die Meldung wurde vollständig entfernt. Falls Sie den Mangel weiterhin
            gemeldet wissen möchten, erstellen Sie bitte eine neue Meldung.
          </p>
        </div>
      )}

      {defects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {searchTerm.length > 0
              ? `Keine Meldungen gefunden für „${searchTerm}“.`
              : EMPTY_STATE_TEXT[activeGroup]}
          </p>
          <Link
            href="/portal/defects/new"
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            {activeGroup === 'alle' && searchTerm.length === 0
              ? 'Erste Meldung erstellen'
              : 'Neue Meldung erstellen'}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {defects.map((d) => {
            const isEmergency = d.priority === 'emergency';
            const attachmentCount = attachmentCountMap.get(d.id) ?? 0;
            return (
              <li key={d.id}>
                <Link
                  href={`/portal/defects/${d.id}`}
                  className={`flex items-center justify-between gap-4 rounded-2xl border bg-[var(--color-background)] p-4 transition ${
                    isEmergency
                      ? 'border-red-300 hover:border-red-400 dark:border-red-800 dark:hover:border-red-700'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isEmergency && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Notfall
                        </span>
                      )}
                      <span className="text-sm font-semibold">{d.title}</span>
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        {d.code ?? ''}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      Erfasst am{' '}
                      {new Date(d.created_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                      {!isEmergency && ` · Priorität: ${PRIORITY_LABEL[d.priority] ?? d.priority}`}
                    </p>
                    {(d.category || attachmentCount > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {d.category && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
                            <Tag className="h-3 w-3" aria-hidden />
                            {d.category}
                          </span>
                        )}
                        {attachmentCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]"
                            aria-label={`${attachmentCount} ${attachmentCount === 1 ? 'Anhang' : 'Anhänge'}`}
                          >
                            <Paperclip className="h-3 w-3" aria-hidden />
                            {attachmentCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_TONE[d.status] ?? 'bg-[var(--color-muted)] text-[var(--color-foreground)]'
                    }`}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
