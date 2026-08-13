import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Health-Check fuer Uptime-Monitoring (UptimeRobot, StatusCake, o.ae.).
// Absichtlich ohne Auth und ohne DB-Roundtrip: gibt {status,ts} + kurze
// Build-Info zurueck. Ein 200 signalisiert, dass die Next-Runtime laeuft
// und Requests annimmt. Fuer eine tiefere Probe (DB, Storage) waere ein
// separater /api/health/deep sinnvoll — hier bewusst nicht, damit ein
// Monitor-Ping keine Last erzeugt.
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'hausmeisterservice',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
