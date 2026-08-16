import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  probeImagePipeline,
  sanitizeCode,
  expectedSharpBinary,
  expectedLibvipsPackage,
  reportSharpBinary,
  reportLibc,
  reportRuntime,
  needsX64V2,
  detectSharpVariant,
  classifyNativeLoadError,
} from '@/lib/images/probe';

describe('sanitizeCode', () => {
  it('reicht einen echten Node-Fehlercode durch', () => {
    expect(sanitizeCode({ code: 'ERR_DLOPEN_FAILED' })).toBe('ERR_DLOPEN_FAILED');
    expect(sanitizeCode({ code: 'MODULE_NOT_FOUND' })).toBe('MODULE_NOT_FOUND');
  });

  it('verschweigt einen Serverpfad, der als code getarnt kommt', () => {
    // Die Antwort ist unauthentifiziert. Alles, was nicht wie eine Konstante
    // aussieht, verlaesst den Server nicht.
    expect(sanitizeCode({ code: '/home/deploy/app/node_modules/sharp/build' })).toBe('UNKNOWN');
    expect(sanitizeCode({ code: 'Could not load the sharp module' })).toBe('UNKNOWN');
  });

  it('behandelt Fehler ohne code als unbekannt', () => {
    expect(sanitizeCode(new Error('kaputt'))).toBe('UNKNOWN');
    expect(sanitizeCode(null)).toBe('UNKNOWN');
    expect(sanitizeCode(undefined)).toBe('UNKNOWN');
    expect(sanitizeCode({ code: 42 })).toBe('UNKNOWN');
  });

  it('begrenzt die Laenge, damit kein Freitext durchrutscht', () => {
    expect(sanitizeCode({ code: 'A'.repeat(200) })).toBe('UNKNOWN');
  });
});

describe('expectedSharpBinary', () => {
  // Der erste Live-Lauf meldete `stage: 'load'` mit `code: 'UNKNOWN'` — eine
  // Auskunft, mit der niemand etwas tun kann. Dieser Name ist die Antwort
  // auf "und was soll ich jetzt installieren?".
  it('nennt fuer Linux mit glibc das glibc-Paket', () => {
    expect(expectedSharpBinary('linux', 'x64', 'glibc')).toBe('@img/sharp-linux-x64');
  });

  it('nennt fuer Alpine das musl-Paket', () => {
    // Der haeufigste Grund fuer ein sharp, das lokal laeuft und im Container
    // nicht: dieselbe Architektur, andere libc.
    expect(expectedSharpBinary('linux', 'x64', 'musl')).toBe('@img/sharp-linuxmusl-x64');
  });

  it('unterscheidet die Architektur', () => {
    expect(expectedSharpBinary('linux', 'arm64', 'glibc')).toBe('@img/sharp-linux-arm64');
    expect(expectedSharpBinary('darwin', 'arm64')).toBe('@img/sharp-darwin-arm64');
    expect(expectedSharpBinary('win32', 'x64')).toBe('@img/sharp-win32-x64');
  });

  it('verwirft alles, was nicht wie ein Paketname aussieht', () => {
    // Die Antwort ist unauthentifiziert — dieselbe Schranke wie bei `code`.
    expect(expectedSharpBinary('../../etc', 'x64')).toBe('UNKNOWN');
  });

  it('beschreibt die Maschine, auf der dieser Test laeuft', () => {
    // Ohne Argumente muss die Funktion die echte Umgebung treffen — sonst
    // haette der Betreiber im Ernstfall einen Namen, der nirgends existiert.
    expect(expectedSharpBinary()).toContain(process.arch);
    expect(expectedSharpBinary()).not.toBe('UNKNOWN');
  });
});

describe('expectedLibvipsPackage', () => {
  it('nennt das eigene libvips-Paket auf Linux und macOS', () => {
    // Dieses Paket haengt als OPTIONALE Abhaengigkeit am Plattform-Paket —
    // eine optionale Abhaengigkeit einer optionalen Abhaengigkeit. Genau so
    // etwas laesst ein Installationslauf aus, ohne abzubrechen.
    expect(expectedLibvipsPackage('linux', 'x64', 'glibc')).toBe('@img/sharp-libvips-linux-x64');
    expect(expectedLibvipsPackage('linux', 'x64', 'musl')).toBe(
      '@img/sharp-libvips-linuxmusl-x64',
    );
    expect(expectedLibvipsPackage('darwin', 'arm64')).toBe('@img/sharp-libvips-darwin-arm64');
  });

  it('meldet fuer Windows null statt eines erfundenen Paketnamens', () => {
    // Unter Windows steckt libvips im Plattform-Paket. Ein Name waere hier
    // eine Erfindung und die Antwort dauerhaft "fehlt" — obwohl nichts
    // fehlt. Genau diese Art Falschmeldung hat den Block schon einmal
    // unbrauchbar gemacht.
    expect(expectedLibvipsPackage('win32', 'x64')).toBeNull();
  });
});

describe('reportLibc', () => {
  it('gibt ausserhalb von Linux keine Version aus', () => {
    expect(reportLibc('win32')).toEqual({ flavour: 'glibc', version: null });
    expect(reportLibc('darwin')).toEqual({ flavour: 'glibc', version: null });
  });

  it('liefert entweder eine reine Versionsnummer oder null', () => {
    // Der Endpunkt ist unauthentifiziert: was hier rausgeht, muss eine Zahl
    // sein und darf kein Freitext werden. Dieselbe Schranke wie bei `code`.
    const { version } = reportLibc();
    if (version !== null) {
      expect(version).toMatch(/^\d+(\.\d+){0,2}$/);
    }
  });
});

describe('reportRuntime', () => {
  it('liefert Node-Version und N-API-ABI in pruefbarer Form', () => {
    // `@img/sharp-linux-x64` verlangt node >=20.9.0. Laeuft draussen etwas
    // Aelteres, erklaert das den Ausfall — und der Betreiber kann es im
    // Hoster-Panel selbst umstellen, ohne Support.
    const { node, napiAbi } = reportRuntime();

    expect(node).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(napiAbi).toMatch(/^\d{1,4}$/);
  });

  it('gibt nichts aus, was kein Versionsformat hat', () => {
    // Dieselbe Schranke wie bei `code`: was nicht wie eine Version aussieht,
    // verlaesst den Server nicht.
    const { node, napiAbi } = reportRuntime();

    expect(node === null || !/[^v\d.]/.test(node)).toBe(true);
    expect(napiAbi === null || !/\D/.test(napiAbi)).toBe(true);
  });
});

describe('reportSharpBinary misst wirklich etwas', () => {
  // DIESER TEST IST DIE LEHRE AUS DEM ERSTEN VERSUCH. Der hat vom
  // App-Verzeichnis aus aufgeloest und deshalb `present: false` gemeldet —
  // auch hier, wo sharp einwandfrei laeuft. Ein Messwert, der immer
  // dasselbe sagt, ist kein Messwert. Da die anderen Tests in dieser Datei
  // beweisen, dass sharp auf dieser Maschine arbeitet, MUSS die Messung
  // hier positiv ausfallen.
  it('findet auf dieser Maschine sowohl sharp als auch sein Binary', () => {
    const report = reportSharpBinary();

    expect(report.expected).toBe(expectedSharpBinary());
    expect(report.sharpPresent).toBe(true);
    expect(report.present).toBe(true);
  });

  it('unterscheidet "liegt da" von "laedt auch"', () => {
    // `present` ist eine Datei-Frage, `loads` eine des Betriebssystems.
    // Genau dazwischen sass der Live-Ausfall: alles vorhanden, Laden
    // scheitert trotzdem. Hier muessen beide wahr sein — sharp arbeitet auf
    // dieser Maschine ja.
    const report = reportSharpBinary();

    expect(report.loads).toBe(true);
  });

  it('nennt keinen Ladegrund, wo nichts zu begruenden ist', () => {
    // Dieselbe Regel wie bei `libvips` und `x64v2`: `null` heisst "die Frage
    // stellt sich nicht". Ein Befund neben `loads: true` waere eine
    // Falschmeldung — und Falschmeldungen haben diesen Bericht schon einmal
    // wertlos gemacht.
    const report = reportSharpBinary();

    expect(report.loadError).toBeNull();
  });

  it('stellt die x86-64-v2-Frage nur dort, wo sie sich stellt', () => {
    // Ein `false` auf einer Plattform ohne diese Pruefung waere dieselbe Art
    // Falschmeldung, die den libvips-Block schon einmal unbrauchbar gemacht
    // hat. Deshalb tri-state, nie bloss Boolean.
    const report = reportSharpBinary();

    if (needsX64V2()) {
      // Wo sharp prueft, muss die Antwort hier positiv sein — sonst haette
      // sharp das Binary verworfen und liefe gar nicht nativ.
      expect(report.x64v2).toBe(true);
    } else {
      expect(report.x64v2).toBeNull();
    }
  });

  it('meldet libvips genau dann, wenn es die Plattform einzeln ausliefert', () => {
    const report = reportSharpBinary();
    const name = expectedLibvipsPackage();

    if (name === null) {
      expect(report.libvips).toBeNull();
    } else {
      // Wo es das Paket gibt, muss es hier auch liegen — sonst liefe sharp
      // auf dieser Maschine nicht, und die uebrigen Tests waeren rot. Und die
      // Bibliothek selbst genauso: `present` allein hat diese Frage nie
      // beantwortet, siehe die Suite unten.
      expect(report.libvips).toEqual({ expected: name, present: true, binary: true });
    }
  });
});

describe('Die libvips-Messung fragt nach der Datei, nicht nach dem Paket', () => {
  // WARUM DIESE SUITE MIT EINER ATTRAPPE ARBEITET UND NICHT MIT DEM ECHTEN
  // PAKET: unter Windows steckt libvips im Plattform-Paket, es gibt gar kein
  // `@img/sharp-libvips-win32-x64`. Der Mechanismus laesst sich hier also
  // nicht am Original messen — wohl aber an einem Paket mit derselben
  // exports-Struktur, und der Mechanismus ist genau das, was falsch war.
  //
  // FALSCH WAR FOLGENDES. Die libvips-Pakete haben keinen `"."`-Eintrag in
  // exports. `require.resolve('@img/sharp-libvips-linux-x64')` endet deshalb
  // IMMER in ERR_PACKAGE_PATH_NOT_EXPORTED, und den zaehlt die Probe
  // absichtlich als gefunden. `present` konnte damit nie `false` werden — auch
  // dann nicht, wenn das lib/-Verzeichnis leer war. Live stand am 16.08.2026
  // genau das da: `present: true` neben `SHARED_LIBRARY_MISSING`.
  const root = mkdtempSync(join(tmpdir(), 'libvips-fixture-'));
  const pkgDir = join(root, 'node_modules', 'fake-libvips');

  mkdirSync(join(pkgDir, 'lib'), { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({
      name: 'fake-libvips',
      version: '1.0.0',
      // Exakt die Struktur von @img/sharp-libvips-*: kein "." und die
      // Bibliothek unter "./binary".
      exports: { './binary': './lib/libvips-cpp.so.8.18.3', './package': './package.json' },
    }),
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '1.0.0' }));

  const req = createRequire(join(root, 'index.js'));
  const resolve = (spec: string): string => {
    try {
      req.resolve(spec);
      return 'OK';
    } catch (err) {
      return String((err as { code?: unknown } | null)?.code);
    }
  };

  it('meldet den blossen Paketnamen als erreichbar, obwohl die Bibliothek fehlt', () => {
    // Das ist der Fehlbefund in Reinform: das lib/-Verzeichnis ist leer, und
    // die alte Messung haette hier trotzdem "vorhanden" gesagt.
    expect(resolve('fake-libvips')).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });

  it('meldet die fehlende Bibliothek als fehlend', () => {
    // MODULE_NOT_FOUND, nicht ERR_PACKAGE_PATH_NOT_EXPORTED — der Unterschied
    // ist es, der aus dem Feld ueberhaupt einen Messwert macht.
    expect(resolve('fake-libvips/binary')).toBe('MODULE_NOT_FOUND');
  });

  it('meldet die vorhandene Bibliothek als vorhanden', () => {
    writeFileSync(join(pkgDir, 'lib', 'libvips-cpp.so.8.18.3'), 'x');

    expect(resolve('fake-libvips/binary')).toBe('OK');
  });

  it('unterscheidet "Eintrag gibt es nicht" von "Datei gibt es nicht"', () => {
    // Ein Paket ohne diesen Eintrag darf kein `false` bekommen. Genau solche
    // Falschmeldungen haben den libvips-Block schon zweimal unbrauchbar
    // gemacht — deshalb tri-state.
    expect(resolve('fake-libvips/gibtesnicht')).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });
});

describe('classifyNativeLoadError', () => {
  // WOZU DAS UEBERHAUPT DA IST. Der Live-Abruf von Sprint 127 meldete
  // `loads: false` und `x64v2: null` — die Datei liegt, sie laedt nicht, und
  // der Grund stand nur im Serverlog. Drei gleich plausible Ursachen mit drei
  // verschiedenen Adressaten: ein fehlendes .so (Installationslauf), ein
  // noexec-Mount (Hoster), ein Speicherlimit (Tarif). Wer nicht weiss,
  // welche, kann nichts tun ausser raten.
  const ALLOWED = new Set([
    'NOT_ATTEMPTED',
    'FILE_MISSING',
    'SHARED_LIBRARY_MISSING',
    'GLIBC_TOO_OLD',
    'SYMBOL_MISSING',
    'EXEC_NOT_PERMITTED',
    'WRONG_BINARY_FORMAT',
    'OUT_OF_MEMORY',
    'ABI_MISMATCH',
    'UNCLASSIFIED',
  ]);

  // Echte Wortlaute von glibc, dem Dynamic Linker und Node — nicht erfunden.
  const cases: ReadonlyArray<readonly [string, string]> = [
    [
      '/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node: cannot open shared object file: No such file or directory',
      'SHARED_LIBRARY_MISSING',
    ],
    [
      'libvips-cpp.so.42: cannot open shared object file: No such file or directory',
      'SHARED_LIBRARY_MISSING',
    ],
    [
      "/lib64/libm.so.6: version `GLIBC_2.29' not found (required by /app/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.42)",
      'GLIBC_TOO_OLD',
    ],
    [
      '/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node: undefined symbol: _ZN4vips6VImage9new_memoryEv',
      'SYMBOL_MISSING',
    ],
    [
      '/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node: failed to map segment from shared object',
      'EXEC_NOT_PERMITTED',
    ],
    [
      '/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node: cannot enable executable stack as shared object requires: Permission denied',
      'EXEC_NOT_PERMITTED',
    ],
    [
      '/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node: cannot allocate memory in static TLS block',
      'OUT_OF_MEMORY',
    ],
    [
      '/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node: invalid ELF header',
      'WRONG_BINARY_FORMAT',
    ],
    [
      'The module was compiled against a different Node.js version using NODE_MODULE_VERSION 108. This version of Node.js requires NODE_MODULE_VERSION 127.',
      'ABI_MISMATCH',
    ],
    ["Module did not self-register: '/app/node_modules/sharp/build/Release/sharp.node'", 'ABI_MISMATCH'],
  ];

  it.each(cases)('ordnet "%s" richtig zu', (message, reason) => {
    expect(classifyNativeLoadError(new Error(message))).toBe(reason);
  });

  it('nimmt bei mehrdeutigen Meldungen die spezifischere Aussage', () => {
    // "cannot enable executable stack as shared object requires: Permission
    // denied" traegt zwei Signale. Wer das allgemeine zuerst prueft, bekommt
    // einen Befund, der stimmt und trotzdem in die falsche Richtung zeigt —
    // und schickt den Betreiber zum falschen Adressaten.
    expect(
      classifyNativeLoadError(
        new Error('/app/lib/sharp.node: cannot enable executable stack as shared object requires: Permission denied'),
      ),
    ).toBe('EXEC_NOT_PERMITTED');
  });

  it('trennt "war nicht da" von "liess sich nicht laden"', () => {
    // Der Unterschied entscheidet, wer handeln muss: eine fehlende Datei ist
    // ein Installationslauf, ein abgewiesenes dlopen ist die Maschine.
    expect(classifyNativeLoadError({ code: 'MODULE_NOT_FOUND', message: 'Cannot find module' })).toBe(
      'FILE_MISSING',
    );
  });

  it('gibt zu, wenn es die Meldung nicht kennt', () => {
    // Lieber 'UNCLASSIFIED' und der Verweis aufs Serverlog als ein Befund,
    // der irgendwie passt. Ein Messwert, der luegt, ist schaedlicher als
    // keiner.
    expect(classifyNativeLoadError(new Error('etwas ganz anderes'))).toBe('UNCLASSIFIED');
    expect(classifyNativeLoadError(null)).toBe('UNCLASSIFIED');
    expect(classifyNativeLoadError({ message: 42 })).toBe('UNCLASSIFIED');
  });

  it('ordnet auch einen echten, hier erzeugten Ladefehler zu', () => {
    // DIE TABELLE OBEN IST ABGESCHRIEBEN, DIESER FALL IST GEMESSEN. Genau das
    // hat in Sprint 126 gefehlt: eine Messung, die nur gegen die eigene
    // Annahme prueft, bestaetigt die Annahme. Hier wirft der Kernel wirklich —
    // unter Linux "invalid ELF header", unter Windows "is not a valid Win32
    // application". Beide meinen dasselbe und muessen hier zusammenfallen.
    const dir = mkdtempSync(join(tmpdir(), 'sharp-probe-'));
    const file = join(dir, 'kaputt.node');
    writeFileSync(file, 'das ist keine Binaerdatei');

    const req = createRequire(join(process.cwd(), 'index.js'));
    let thrown: unknown;

    try {
      req(file);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(classifyNativeLoadError(thrown)).toBe('WRONG_BINARY_FORMAT');
  });

  it('gibt niemals die Meldung selbst zurueck', () => {
    // HIER SITZT DIE SCHRANKE. Diese Funktion bekommt als einzige im Bericht
    // Serverpfade zu sehen — sie liest sie und behaelt sie. Faellt jemand in
    // Versuchung, "zur besseren Diagnose" die Meldung durchzureichen, ist das
    // hier rot.
    for (const [message] of cases) {
      const reason = classifyNativeLoadError(new Error(message));

      expect(ALLOWED.has(reason)).toBe(true);
      expect(message).not.toContain(reason);
    }
  });
});

describe('needsX64V2', () => {
  it('stellt die Frage nur fuer Linux auf x64', () => {
    // sharp prueft die Mikroarchitektur genau fuer 'linux-x64' und
    // 'linuxmusl-x64' — beide melden platform 'linux' und arch 'x64'.
    expect(needsX64V2('linux', 'x64')).toBe(true);
    expect(needsX64V2('linux', 'arm64')).toBe(false);
    expect(needsX64V2('win32', 'x64')).toBe(false);
    expect(needsX64V2('darwin', 'x64')).toBe(false);
  });
});

describe('detectSharpVariant', () => {
  // Auf dieser Maschine laeuft sharp nachweislich nativ — die uebrigen Tests
  // waeren sonst rot. Ein Variant-Melder, der hier 'wasm' sagt, misst nicht
  // den Server, sondern sich selbst.
  it('erkennt auf dieser Maschine den nativen Weg', () => {
    expect(detectSharpVariant()).toBe('native');
  });

  it('deckt sich mit dem, was der Binary-Bericht sagt', () => {
    const report = reportSharpBinary();
    const usable = report.loads && (report.x64v2 ?? true);

    expect(detectSharpVariant()).toBe(usable ? 'native' : 'wasm');
  });
});

describe('Der WASM-Rueckfall liegt wirklich im Paket', () => {
  // OHNE DIESEN TEST WAERE SPRINT 127 EINE BEHAUPTUNG. sharp fuehrt
  // @img/sharp-wasm32 NICHT als eigene optionale Abhaengigkeit, sondern nur
  // ueber @img/sharp-freebsd-wasm32 und @img/sharp-webcontainers-wasm32 —
  // und die sind plattformgefiltert, installieren auf linux-x64 also nie.
  // Der Rueckfall existiert im Loader seit jeher; ihm fehlte allein das
  // Paket. Faellt der Eintrag hier je wieder raus, ist der Server still
  // wieder da, wo er im August 2026 war.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };

  it('steht als direkte Abhaengigkeit in der package.json', () => {
    expect(pkg.dependencies['@img/sharp-wasm32']).toBeDefined();
  });

  it('ist exakt auf die installierte sharp-Version festgenagelt', () => {
    // Die @img-Pakete gehoeren zur sharp-Version wie ein Schluessel zum
    // Schloss; sharp selbst pinnt sie deshalb ohne Bereich. Ein `^` hier
    // waere ein leiser Versionsdrift, der erst auffaellt, wenn der Fallback
    // gebraucht wird — also im schlechtesten Moment.
    const installed = JSON.parse(
      readFileSync(
        join(process.cwd(), 'node_modules', 'sharp', 'package.json'),
        'utf8',
      ),
    ) as { version: string };

    expect(pkg.dependencies['@img/sharp-wasm32']).toBe(installed.version);
  });

  it('laesst sich von sharp aus aufloesen, nicht nur vom App-Verzeichnis', () => {
    // Dieselbe Falle wie in Sprint 126: pnpm legt die @img-Pakete nicht ins
    // oberste node_modules. Entscheidend ist allein, ob SHARP das Paket
    // sieht — von dort wird es geladen.
    const fromApp = createRequire(join(process.cwd(), 'index.js'));
    const fromSharp = createRequire(fromApp.resolve('sharp'));

    expect(() => fromSharp.resolve('@img/sharp-wasm32/sharp.node')).not.toThrow();
  });
});

describe('probeImagePipeline', () => {
  // Dieser Test misst absichtlich die AUSFUEHRENDE Maschine, nicht eine
  // Attrappe. Genau das ist der Punkt: Sprint 124 ist daran gescheitert,
  // dass sharp lokal lief und auf dem Server nicht. Ein Mock haette beide
  // Male gruen gemeldet. So schlaegt CI an, bevor deployt wird.
  it('meldet eine arbeitsfaehige Bildverarbeitung', async () => {
    const result = await probeImagePipeline();
    expect(result).toEqual({ ok: true, stage: null, code: null, variant: 'native' });
  });

  it('haengt auf dem nativen Weg keinen Binary-Bericht an', () => {
    // Der Block erklaert, warum das native Binary NICHT genommen wurde. Wo
    // es genommen wurde, erklaert er nichts und waere nur Rauschen in einer
    // Antwort, die absichtlich schmal ist.
    return probeImagePipeline().then((result) => {
      expect(result.variant).toBe('native');
      expect(result.binary).toBeUndefined();
    });
  });
});

describe('Deep-Health-Endpunkt gibt keinen Freitext preis', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'health', 'deep', 'route.ts'),
    'utf8',
  );

  it('serialisiert keine Fehlermeldung in die Antwort', () => {
    // `.message` waere der bequeme Weg und traegt Serverpfade nach draussen.
    expect(source).not.toMatch(/\.message/);
  });

  it('antwortet bei kaputter Probe mit 503, nicht mit 200', () => {
    // Ohne den abweichenden Status muesste ein Monitor JSON parsen, um den
    // Ausfall zu bemerken — und genau das tut in der Praxis keiner.
    expect(source).toContain('503');
  });
});
