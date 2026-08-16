import { NextResponse } from 'next/server';
import { getBuildInfo } from '@/lib/build-info';
import { probeImagePipeline } from '@/lib/images/probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sprint 125: die tiefe Probe, die /api/health seit Sprint 17 im Kommentar
// ankuendigt und bewusst nicht selbst macht. Der flache Endpunkt bleibt
// unveraendert — ein Monitor, der im Minutentakt pingt, soll weiterhin
// nichts ausser der Runtime beruehren.
//
// Warum es diesen Endpunkt jetzt gibt: Sprint 124 lieferte eine
// oeffentliche Meldung korrekt aus, das angehaengte Foto fiel still weg.
// Die Anwendung verhaelt sich dabei genau richtig — der Mangel ist die
// Nachricht, das Foto ist Beiwerk — aber niemand erfaehrt davon. Ein
// Ausfall, den nur der Melder sieht und der Betreiber nie, ist ein Ausfall
// mit unbegrenzter Laufzeit.
//
// Antwort ist bewusst schmal und ohne Freitext: `stage`, `code` und der
// Paketname in `binary` sind Konstanten, keine Fehlermeldungen. Der
// `binary`-Block kommt nur mit, wenn der native Weg NICHT benutzt wird —
// Begruendung in src/lib/images/probe.ts.
//
// Der HTTP-Status trennt "Runtime laeuft" von "Runtime kann arbeiten":
// 200 wenn alle Proben gruen sind, 503 sonst. Ein Monitor kann damit ohne
// JSON-Parsing alarmieren, und /api/health bleibt weiterhin gruen — die
// Seite laeuft ja, sie kann nur eine Sache nicht.
//
// Sprint 127: `variant: 'wasm'` gilt bewusst als GRUEN und antwortet 200.
// Die Faehigkeit ist da, Uploads laufen — dafuer liegt der Fallback im
// Paket. Es waere falsch, dafuer jemanden nachts zu wecken. Verschwiegen
// wird es trotzdem nicht: `variant` steht in der Antwort, `binary` erklaert
// warum der native Weg ausfiel, und beim Start geht einmal eine Zeile ins
// Serverlog. Gruen heisst hier "es arbeitet", nicht "alles ist gut".
export async function GET() {
  const image = await probeImagePipeline();
  const healthy = image.ok;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'hausmeisterservice',
      build: getBuildInfo(),
      checks: {
        // Betrifft Dokumenten-Upload, Portal-Fotos und die oeffentliche
        // Meldestrecke — alle drei entfernen EXIF-Daten per Re-Encode.
        image_pipeline: image,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
