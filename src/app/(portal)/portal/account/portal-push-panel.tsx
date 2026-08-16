'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Sprint 43 · Bewohner-Variante des Staff-PushSubscriptionsPanel. Bewusst
// dupliziert statt shared, weil (a) alle URLs auf /api/portal/push/*
// zeigen (Portal-Auth statt Tenant-Auth) und (b) die Copy sich am
// Bewohner-Kontext orientiert (Ankuendigungen/Meldungen/Nachrichten,
// nicht Auftraege/Wartungen).
type Status =
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  | { kind: 'default' } // Permission noch nie gefragt
  | { kind: 'subscribed'; endpoint: string }
  | { kind: 'not_subscribed' };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function PortalPushPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus({ kind: 'unsupported' });
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus({ kind: 'denied' });
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const existing = reg ? await reg.pushManager.getSubscription() : null;
      if (existing) {
        setStatus({ kind: 'subscribed', endpoint: existing.endpoint });
        return;
      }
      if (Notification.permission === 'granted') {
        setStatus({ kind: 'not_subscribed' });
      } else {
        setStatus({ kind: 'default' });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler beim Pruefen');
    }
  }, []);

  useEffect(() => {
    // Sprint 132 · Wie im Staff-Pendant (settings/notifications/push-panel):
    // Permission und vorhandene Subscription stehen nur im Browser und
    // muessen beim Mounten gelesen werden.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const enable = () => {
    startTransition(async () => {
      setErr(null);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setErr('Benachrichtigungen wurden nicht erlaubt.');
          await refresh();
          return;
        }
        const keyRes = await fetch('/api/portal/push/vapid-key');
        if (!keyRes.ok) throw new Error('VAPID-Key nicht verfuegbar');
        const { public_key } = (await keyRes.json()) as { public_key: string };

        const reg =
          (await navigator.serviceWorker.getRegistration('/sw.js')) ??
          (await navigator.serviceWorker.register('/sw.js'));
        await navigator.serviceWorker.ready;

        const key = urlBase64ToUint8Array(public_key);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key.buffer.slice(0) as ArrayBuffer,
        });
        const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          throw new Error('Subscription unvollstaendig');
        }
        const res = await fetch('/api/portal/push/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            user_agent: navigator.userAgent.slice(0, 300),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server ${res.status}`);
        }
        await refresh();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Fehler beim Aktivieren');
      }
    });
  };

  const disable = () => {
    startTransition(async () => {
      setErr(null);
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => undefined);
          await fetch('/api/portal/push/unsubscribe', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          });
        }
        await refresh();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Fehler beim Deaktivieren');
      }
    });
  };

  if (status === null) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Pruefe Status…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {status.kind === 'unsupported' && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Dieser Browser unterstuetzt keine Web-Push-Benachrichtigungen. Auf iOS: nur mit als PWA installierter App.
        </p>
      )}
      {status.kind === 'denied' && (
        <p className="text-sm text-[var(--color-destructive)]">
          Benachrichtigungen sind fuer diese Seite blockiert. Bitte in den Browser-Einstellungen freigeben und die Seite neu laden.
        </p>
      )}
      {status.kind === 'default' && (
        <>
          <p className="text-sm">
            Aktivieren Sie Push-Benachrichtigungen auf diesem Geraet, um ueber neue Ankuendigungen, Nachrichten und Status-Aenderungen an Ihren Meldungen sofort informiert zu werden.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={enable}
            className="inline-flex h-9 w-fit items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Wird aktiviert…' : 'Aktivieren'}
          </button>
        </>
      )}
      {status.kind === 'not_subscribed' && (
        <>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Berechtigung liegt vor, dieses Geraet ist aber noch nicht angemeldet.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={enable}
            className="inline-flex h-9 w-fit items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Wird angemeldet…' : 'Geraet anmelden'}
          </button>
        </>
      )}
      {status.kind === 'subscribed' && (
        <>
          <p className="text-sm text-[var(--color-success)]">
            Dieses Geraet empfaengt Push-Benachrichtigungen.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={disable}
            className="inline-flex h-9 w-fit items-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-muted)] disabled:opacity-60"
          >
            {pending ? 'Wird deaktiviert…' : 'Auf diesem Geraet deaktivieren'}
          </button>
        </>
      )}
      {err && <p className="text-sm text-[var(--color-destructive)]">{err}</p>}
    </div>
  );
}
