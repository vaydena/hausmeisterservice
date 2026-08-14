import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireResidentContext } from '@/lib/portal/current';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sprint 43 · Portal-Push-Unsubscribe. Analog zur Staff-Route
// /api/push/unsubscribe, gated per requireResidentContext.
//
// Service-Role aus demselben Grund wie subscribe (siehe dort): Bewohner
// haben keinen memberships-Eintrag, deshalb blockieren die
// push_subscriptions-RLS-Policies alle Portal-Deletes. Wir filtern
// explizit auf user_id + endpoint, sodass ein Bewohner nicht die Subs
// eines anderen Nutzers loeschen kann, selbst wenn er dessen endpoint
// erraet.
const unsubscribeSchema = z.object({
  endpoint: z.string().url().min(20).max(1000),
});

async function handle(req: NextRequest) {
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

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { error, count } = await service
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', ctx.userId);

  if (error) {
    return NextResponse.json({ error: 'delete_failed', message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}

export const DELETE = handle;
export const POST = handle;
