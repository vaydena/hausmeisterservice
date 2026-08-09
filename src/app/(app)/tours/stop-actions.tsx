'use client';

import { useTransition } from 'react';
import { removeStopAction, reorderStopsAction, setStopStatusAction } from './actions';
import { STOP_STATUSES, STOP_STATUS_LABEL, type StopStatus } from '@/lib/schemas/tours';

export function StopStatusSelect({
  stopId,
  currentStatus,
  disabled,
}: {
  stopId: string;
  currentStatus: StopStatus;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      value={currentStatus}
      disabled={disabled || pending}
      onChange={(e) => {
        const status = e.target.value as StopStatus;
        const fd = new FormData();
        fd.set('stop_id', stopId);
        fd.set('status', status);
        start(async () => {
          await setStopStatusAction(fd);
        });
      }}
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs"
    >
      {STOP_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STOP_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function StopReorderControls({
  stopIds,
  stopId,
  tourId,
  disabled,
}: {
  stopIds: string[];
  stopId: string;
  tourId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const idx = stopIds.indexOf(stopId);
  const canUp = idx > 0;
  const canDown = idx >= 0 && idx < stopIds.length - 1;

  function move(delta: -1 | 1) {
    if (idx < 0) return;
    const next = [...stopIds];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    const fd = new FormData();
    fd.set('tour_id', tourId);
    fd.set('stop_ids', JSON.stringify(next));
    start(async () => {
      await reorderStopsAction(fd);
    });
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || pending || !canUp}
        onClick={() => move(-1)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-[var(--color-muted)] disabled:opacity-40"
        title="Nach oben"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={disabled || pending || !canDown}
        onClick={() => move(1)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-[var(--color-muted)] disabled:opacity-40"
        title="Nach unten"
      >
        ↓
      </button>
    </div>
  );
}

export function RemoveStopButton({
  stopId,
  tourId,
  disabled,
}: {
  stopId: string;
  tourId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => {
        if (!confirm('Stopp wirklich entfernen?')) return;
        const fd = new FormData();
        fd.set('stop_id', stopId);
        fd.set('tour_id', tourId);
        start(async () => {
          await removeStopAction(fd);
        });
      }}
      className="text-xs text-[var(--color-destructive)] hover:underline disabled:opacity-40"
    >
      {pending ? '…' : 'Entfernen'}
    </button>
  );
}
