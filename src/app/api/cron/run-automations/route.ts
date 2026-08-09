import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { runAllEnabledRules } from '@/lib/automations/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized(reason: string): NextResponse {
  return NextResponse.json({ error: 'unauthorized', reason }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const env = serverEnv();
  const secret = env.AUTOMATION_CRON_SECRET;
  if (!secret) return unauthorized('cron_secret_not_configured');

  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (header !== expected) return unauthorized('bad_token');

  const supabase = createSupabaseServiceClient();
  const started = Date.now();
  try {
    const results = await runAllEnabledRules(supabase);
    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      total_rules: results.length,
      results: results.map((r) => ({
        rule_id: r.ruleId,
        matches: r.result.matches,
        actions_ok: r.result.actionsOk,
        actions_failed: r.result.actionsFailed,
        error: r.result.error,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET liefert dieselbe Semantik, damit einfache Cron-Setups (curl -X GET) laufen.
export const GET = POST;
