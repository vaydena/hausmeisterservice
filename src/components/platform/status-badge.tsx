const STATUS_STYLES: Record<string, string> = {
  trial:     'bg-blue-50 text-blue-700 ring-blue-600/20',
  active:    'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  past_due:  'bg-amber-50 text-amber-800 ring-amber-600/20',
  suspended: 'bg-red-50 text-red-700 ring-red-600/20',
  canceled:  'bg-neutral-100 text-neutral-700 ring-neutral-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  trial:     'Testphase',
  active:    'Aktiv',
  past_due:  'Zahlung offen',
  suspended: 'Suspendiert',
  canceled:  'Gekündigt',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.canceled;
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {label}
    </span>
  );
}
