import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/current';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    ctx = await requireTenantContext();
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
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
