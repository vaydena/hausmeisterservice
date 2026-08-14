import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireResidentContext } from '@/lib/portal/current';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sprint 43 · Portal-Push-Subscribe. Analog zur Staff-Route
// /api/push/subscribe, aber gated per requireResidentContext.
//
// Warum service_role statt server-client: Die RLS-Policies auf
// push_subscriptions pruefen app_auth.is_tenant_member(tenant_id) bzw.
// tenant_id = app_auth.current_tenant_id(). Beide Helper lesen aus
// memberships — Bewohner haben dort keinen Eintrag (sie sind Kunden der
// Hausverwaltung, nicht Team-Mitglieder), also blockiert RLS jeden
// Portal-Insert. requireResidentContext liefert user_id und tenant_id
// verifiziert aus dem Residents-Record; wir schreiben strikt mit diesen
// Werten. Analog zu list_user_sessions in /portal/account/page.tsx, das
// aus demselben Grund einen Service-Client verwendet.
const subscribeSchema = z.object({
  endpoint: z.string().url().min(20).max(1000),
  keys: z.object({
    p256dh: z.string().min(60).max(200),
    auth: z.string().min(12).max(100),
  }),
  user_agent: z.string().max(300).nullable().optional(),
});

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireResidentContext();
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.format() }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('push_subscriptions')
    .upsert(
      {
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: parsed.data.user_agent ?? req.headers.get('user-agent')?.slice(0, 300) ?? null,
        last_used_at: null,
        last_error: null,
      },
      { onConflict: 'endpoint' },
    )
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: 'insert_failed', message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
