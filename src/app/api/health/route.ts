import { NextResponse } from 'next/server';
import { getBuildInfo } from '@/lib/build-info';
import { serverEnv } from '@/lib/env';
import { isPaypalConfigured } from '@/lib/platform/paypal';
import { getBankDetails } from '@/lib/platform/bank-transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Health-Check fuer Uptime-Monitoring (UptimeRobot, StatusCake, o.ae.).
// Absichtlich ohne Auth und ohne DB-Roundtrip: gibt {status,ts} + kurze
// Build-Info zurueck. Ein 200 signalisiert, dass die Next-Runtime laeuft
// und Requests annimmt. Fuer eine tiefere Probe (DB, Storage) waere ein
// separater /api/health/deep sinnvoll — hier bewusst nicht, damit ein
// Monitor-Ping keine Last erzeugt.
//
// Sprint 99: Der `build`-Block loest ein, was dieser Kommentar seit
// Sprint 17 behauptet — die Antwort trug bisher gar keine Build-Info.
// Damit beantwortet der Endpunkt nach einem Deploy nicht mehr nur "laeuft
// etwas?", sondern "laeuft schon der neue Stand?". Die bestehenden Keys
// bleiben unveraendert, damit ein Monitor, der auf status/timestamp
// prueft, nicht bricht.
//
// Dass der Marker unauthentifiziert sichtbar ist, ist eine bewusste
// Abwaegung gegen `poweredByHeader: false`: der Kurz-SHA eines privaten
// Repos verraet einem Fremden nichts Verwertbares, waehrend der
// operative Nutzen — ein Deploy-Verify, der nicht raten muss — nur
// entsteht, wenn ein einfacher Aufruf von aussen ihn lesen kann.
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'hausmeisterservice',
      build: getBuildInfo(),
      // Konfig-Presence NUR als Booleans/Modus — keine Geheimwerte. Dient dem
      // Go-live-Verify der Abo-Zahlarten von aussen (sieht der laufende Prozess
      // die PAYPAL_*/PAYMENT_BANK_*-ENV?), ohne Login. Gleiche Abwaegung wie
      // beim Build-Marker oben: verraet nichts Verwertbares.
      config: {
        paypalConfigured: isPaypalConfigured(),
        paypalMode: serverEnv().PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
        bankConfigured: getBankDetails() !== null,
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
