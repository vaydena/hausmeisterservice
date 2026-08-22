// AUTO-GENERIERT aus der freigegebenen Landingpage (siehe reference_hausmeister_landingpage).
// Statische, vertrauenswuerdige Marketing-Markup fuer die oeffentliche Startseite (/).
// Wird in page.tsx via dangerouslySetInnerHTML in den auf .lp gescopten Wrapper gerendert.
// Bearbeiten: Text hier direkt aendern; Styles in ./landing.css; {{YEAR}} wird in page.tsx ersetzt.

export const LANDING_HTML = `
<!-- ============================ NAV ============================ -->
  <header class="nav">
    <div class="wrap nav-in">
      <a class="brand" href="#top">
        <span class="logo">HS</span>
        Hausmeisterservice
      </a>
      <nav class="nav-links">
        <a class="link" href="#bereiche">Bereiche</a>
        <a class="link" href="#einsatz">Einsatz</a>
        <a class="link" href="#finanzen">Finanzen</a>
        <a class="link" href="#preise">Preise</a>
      </nav>
      <div class="nav-cta">
        <a class="signin" href="/login">Anmelden</a>
        <a class="btn btn-blue" href="/signup">Kostenlos testen</a>
      </div>
    </div>
  </header>

  <!-- ============================ HERO ============================ -->
  <section class="hero on-navy" id="top">
    <div class="wrap hero-in">
      <div class="reveal">
        <span class="eyebrow"><span class="tick"></span>Hausmeistersoftware für Hausmeister &amp; Gebäudedienste</span>
        <h1>Der ganze Betrieb.<br><span class="hl">Ein System.</span></h1>
        <p class="lede">Objekte, Aufträge, Einsätze und Abrechnung — Hausmeisterservice bündelt Ihren kompletten Arbeitsalltag an einem Ort. Schluss mit Zettelwirtschaft und verstreuten Chats.</p>
        <div class="cta-row">
          <a class="btn btn-amber" href="/signup">14 Tage kostenlos testen <svg class="arw" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10h11M11 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
          <a class="btn btn-ghost-navy" href="#bereiche">Alle Bereiche ansehen</a>
        </div>
        <div class="microtrust">
          <span><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 2l6 2.5v4.2c0 4-2.7 6.7-6 8.3-3.3-1.6-6-4.3-6-8.3V4.5L10 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> DSGVO-konform</span>
          <span><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M3 8l7-5 7 5v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Server in Deutschland</span>
          <span><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Ohne Kreditkarte</span>
        </div>
      </div>

      <!-- Hero shot: Dashboard -->
      <div class="reveal shot">
        <div class="win">
          <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/dashboard</span></div>
          <div class="app">
            <div class="app-topbar">
              <div class="co"><span class="mk">BG</span><div><b>Berger Gebäudedienste</b><br><small>Übersicht · KW 34</small></div></div>
              <div class="who"><span>Thomas Berger · Inhaber</span><span class="av">TB</span></div>
            </div>
            <div class="pane" style="display:flex; flex-direction:column; gap:14px;">
              <div class="kpis">
                <div class="kpi"><div class="lab">Offene Aufträge</div><div class="val">7</div><div class="bar"><i style="width:58%"></i></div></div>
                <div class="kpi amber"><div class="lab">Meldungen heute</div><div class="val">3</div><div class="bar"><i style="width:30%"></i></div></div>
                <div class="kpi"><div class="lab">Fällige Wartungen</div><div class="val">2</div><div class="bar"><i style="width:20%"></i></div></div>
                <div class="kpi"><div class="lab">Stunden (KW)</div><div class="val">214<small>▲ 6%</small></div><div class="bar"><i style="width:74%"></i></div></div>
              </div>
              <div class="grid2">
                <div class="panel">
                  <div class="ph"><h5>Heute zu erledigen</h5><span class="act">Alle Aufträge</span></div>
                  <div class="rows">
                    <div class="row"><span class="ic tint-amber"><svg viewBox="0 0 20 20" fill="none"><path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/></svg></span><div class="gro"><b>Heizung Lindenhof — Thermostat Whg. 14</b><span>Lindenhof · fällig heute</span></div><span class="pill warn">Offen</span></div>
                    <div class="row"><span class="ic tint-blue"><svg viewBox="0 0 20 20" fill="none"><path d="M5 4h10v12H5z" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h4M8 11h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span><div class="gro"><b>Treppenhausreinigung Sonnenallee 120</b><span>Andrea Voss · in Arbeit</span></div><span class="pill info">In Arbeit</span></div>
                    <div class="row"><span class="ic tint-green"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div class="gro"><b>Rauchmelder-Prüfung Ärztehaus</b><span>Sven Lorenz · erledigt 09:40</span></div><span class="pill ok">Erledigt</span></div>
                  </div>
                </div>
                <div class="panel">
                  <div class="ph"><h5>Nächste Wartungen</h5><span class="act">Kalender</span></div>
                  <div class="rows">
                    <div class="row"><span class="ic tint-slate"><svg viewBox="0 0 20 20" fill="none"><path d="M6 3v3M14 3v3M4 8h12M4 6h12v10H4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span><div class="gro"><b>Aufzug Lindenhof — TÜV</b><span>in 4 Tagen</span></div><span class="pill warn">28.08.</span></div>
                    <div class="row"><span class="ic tint-slate"><svg viewBox="0 0 20 20" fill="none"><path d="M6 3v3M14 3v3M4 8h12M4 6h12v10H4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span><div class="gro"><b>Heizungsanlage Havelblick</b><span>in 9 Tagen</span></div><span class="pill neut">02.09.</span></div>
                    <div class="row"><span class="ic tint-slate"><svg viewBox="0 0 20 20" fill="none"><path d="M6 3v3M14 3v3M4 8h12M4 6h12v10H4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span><div class="gro"><b>Feuerlöscher Bürohaus</b><span>in 12 Tagen</span></div><span class="pill neut">05.09.</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ============================ STAT STRIP ============================ -->
  <div class="stripe">
    <div class="wrap stripe-in">
      <div class="reveal"><div class="n">10<span class="u">+</span></div><div class="l">Bereiche in einer App</div></div>
      <div class="reveal"><div class="n">1</div><div class="l">Login für den ganzen Betrieb</div></div>
      <div class="reveal"><div class="n">14</div><div class="l">Tage kostenlos testen</div></div>
      <div class="reveal"><div class="n">100<span class="u">%</span></div><div class="l">DSGVO · Hosting in Deutschland</div></div>
    </div>
  </div>

  <!-- ============================ BEREICHE ============================ -->
  <section class="band" id="bereiche">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="eyebrow"><span class="tick"></span>Alle Bereiche im Überblick</span>
        <h2>Ein Werkzeug für jeden Handgriff im Betrieb.</h2>
        <p>Von der ersten Schadensmeldung bis zur fertigen Rechnung: Jeder Bereich greift in den nächsten. Sehen Sie, was Hausmeisterservice für Sie übernimmt.</p>
      </div>

      <div style="margin-top:64px; display:flex; flex-direction:column;">

        <!-- 1 · AUFGABEN -->
        <div class="feature reveal" id="aufgaben">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Aufgaben</span>
            <h3>Kein Auftrag geht mehr verloren.</h3>
            <p class="desc">Aufträge, Schadensmeldungen, Wartungen und Checklisten laufen in einem Posteingang zusammen — mit klaren Status, Fristen und Zuständigkeiten. Ihr Team weiß jederzeit, was als Nächstes dran ist.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Aufträge mit Status, Priorität und Fälligkeit</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Schadensmeldungen direkt vom Objekt — mit Foto</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Wiederkehrende Wartungen &amp; digitale Checklisten</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/work-orders</span></div>
              <div class="app"><div class="pane">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                  <div><div class="h1app">Aufträge</div><div class="sub">18 aktiv · 4 überfällig</div></div>
                  <span class="pill info plain" style="background:var(--blue); color:#fff; padding:7px 12px;">+ Neuer Auftrag</span>
                </div>
                <div class="panel"><table class="tbl">
                  <thead><tr><th>Auftrag</th><th>Objekt</th><th>Zugewiesen</th><th>Fällig</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr><td class="strong">Thermostat Whg. 14 defekt</td><td>Lindenhof</td><td><span class="who2"><span class="ava" style="background:#1e40af">MK</span>M. Krüger</span></td><td class="mono">Heute</td><td><span class="pill warn">Offen</span></td></tr>
                    <tr><td class="strong">Treppenhausreinigung KW 34</td><td>Sonnenallee 120</td><td><span class="who2"><span class="ava" style="background:#0e7490">AV</span>A. Voss</span></td><td class="mono">22.08.</td><td><span class="pill info">In Arbeit</span></td></tr>
                    <tr><td class="strong">Graffiti-Entfernung Fassade</td><td>Havelblick</td><td><span class="who2"><span class="ava" style="background:#b45309">DK</span>D. Kowalski</span></td><td class="mono">23.08.</td><td><span class="pill warn">Offen</span></td></tr>
                    <tr><td class="strong">Rauchmelder-Prüfung</td><td>Ärztehaus</td><td><span class="who2"><span class="ava" style="background:#15803d">SL</span>S. Lorenz</span></td><td class="mono">Heute</td><td><span class="pill ok">Erledigt</span></td></tr>
                    <tr><td class="strong">Winterdienst-Vorbereitung</td><td>Alle Objekte</td><td><span class="who2"><span class="ava" style="background:#475569">TB</span>T. Berger</span></td><td class="mono">31.08.</td><td><span class="pill neut">Geplant</span></td></tr>
                  </tbody>
                </table></div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 2 · OBJEKTE -->
        <div class="feature flip reveal" id="objekte">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Objekte</span>
            <h3>Jedes Gebäude komplett im Griff.</h3>
            <p class="desc">Alle Liegenschaften mit Adresse, Einheiten, Ansprechpartnern, Schlüsseln und Zählern an einem Ort. Vom Wohnpark bis zum Ärztehaus — die ganze Objektakte auf einen Blick.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Objektakte mit Einheiten &amp; Ansprechpartnern</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Schlüsselverwaltung mit Ausgabe-Protokoll</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Zählerstände lückenlos dokumentiert</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/properties</span></div>
              <div class="app"><div class="pane">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                  <div><div class="h1app">Objekte</div><div class="sub">5 Liegenschaften · 214 Einheiten</div></div>
                </div>
                <div class="grid2" style="margin-bottom:12px;">
                  <div class="panel" style="padding:14px;"><div style="display:flex; gap:11px; align-items:flex-start;"><span class="ic tint-blue" style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none;"><svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M4 17V6l6-3 6 3v11M8 17v-4h4v4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span><div><div class="strong">Wohnanlage Lindenhof</div><div class="sub">Lindenstr. 12–18 · 10969 Berlin</div><div class="tag-row" style="margin-top:8px;"><span class="t">48 WE</span><span class="t">Aufzug</span></div></div></div></div>
                  <div class="panel" style="padding:14px;"><div style="display:flex; gap:11px; align-items:flex-start;"><span class="ic tint-slate" style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none;"><svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M4 17V4h8v13M12 9h4v8M6 7h2M6 10h2M6 13h2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span><div><div class="strong">Bürohaus Sonnenallee</div><div class="sub">Sonnenallee 120 · 12059 Berlin</div><div class="tag-row" style="margin-top:8px;"><span class="t">Gewerbe</span><span class="t">Reinigung</span></div></div></div></div>
                </div>
                <div class="panel">
                  <div class="ph"><h5>Lindenhof · Schlüssel &amp; Zähler</h5><span class="act">Objektakte öffnen</span></div>
                  <table class="tbl"><tbody>
                    <tr><td><span class="who2"><span class="ic tint-amber" style="width:26px;height:26px;border-radius:7px;"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="10" r="3.2" stroke="currentColor" stroke-width="1.5"/><path d="M10 10h7M15 10v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>Generalschlüssel GS-01</span></td><td>ausgegeben an M. Krüger</td><td><span class="pill info">3 im Umlauf</span></td></tr>
                    <tr><td><span class="who2"><span class="ic tint-blue" style="width:26px;height:26px;border-radius:7px;"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 3h10v14l-5-2.5L5 17z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span>Zähler Strom Allgemein</span></td><td class="mono">42.815 kWh</td><td><span class="pill ok">abgelesen 01.08.</span></td></tr>
                    <tr><td><span class="who2"><span class="ic tint-blue" style="width:26px;height:26px;border-radius:7px;"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 3h10v14l-5-2.5L5 17z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span>Zähler Wasser Haus 14</span></td><td class="mono">1.207 m³</td><td><span class="pill warn">Ablesung fällig</span></td></tr>
                  </tbody></table>
                </div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 3 · PERSONEN -->
        <div class="feature reveal" id="personen">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Personen</span>
            <h3>Mitarbeiter, Bewohner, Eigentümer — sauber getrennt.</h3>
            <p class="desc">Führen Sie Ihr Team mit Rollen und Qualifikationen, und halten Sie Bewohner und Eigentümer je Objekt fest. Jeder sieht genau das, was er sehen soll — nicht mehr und nicht weniger.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Mitarbeiter mit Qualifikationen &amp; Rollen</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Bewohner- und Eigentümerverzeichnis je Objekt</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>DSGVO-konform getrennte Zugriffe</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/people/employees</span></div>
              <div class="app"><div class="pane">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                  <div><div class="h1app">Mitarbeiter</div><div class="sub">6 aktiv · 3 Rollen</div></div>
                </div>
                <div class="panel"><table class="tbl">
                  <thead><tr><th>Name</th><th>Rolle</th><th>Qualifikation</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr><td><span class="who2"><span class="ava" style="background:#475569">TB</span><span class="strong">Thomas Berger</span></span></td><td><span class="pill info plain" style="background:var(--info-bg);color:var(--blue)">Inhaber</span></td><td>Geschäftsführung</td><td><span class="pill ok">Aktiv</span></td></tr>
                    <tr><td><span class="who2"><span class="ava" style="background:#1e40af">MK</span><span class="strong">Maik Krüger</span></span></td><td><span class="pill neut plain">Vorarbeiter</span></td><td>Elektrofachkraft</td><td><span class="pill ok">Aktiv</span></td></tr>
                    <tr><td><span class="who2"><span class="ava" style="background:#0e7490">AV</span><span class="strong">Andrea Voss</span></span></td><td><span class="pill neut plain">Objektbetreuung</span></td><td>Reinigung &amp; Grün</td><td><span class="pill ok">Aktiv</span></td></tr>
                    <tr><td><span class="who2"><span class="ava" style="background:#15803d">SL</span><span class="strong">Sven Lorenz</span></span></td><td><span class="pill neut plain">Haustechnik</span></td><td>Heizung/Sanitär</td><td><span class="pill ok">Aktiv</span></td></tr>
                    <tr><td><span class="who2"><span class="ava" style="background:#b45309">DK</span><span class="strong">Dariusz Kowalski</span></span></td><td><span class="pill neut plain">Grünpflege</span></td><td>Motorsägeschein</td><td><span class="pill ok">Aktiv</span></td></tr>
                  </tbody>
                </table></div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 4 · EINSATZ -->
        <div class="feature flip reveal" id="einsatz">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Einsatz</span>
            <h3>Planung, Schichten und Zeiten — an einem Strang.</h3>
            <p class="desc">Planen Sie Einsätze im Wochenkalender, teilen Sie Schichten ein und erfassen Sie Arbeitszeiten sekundengenau. Touren bündeln die Stationen eines Tages zur effizienten Route.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Wochenplanung &amp; Schichteinteilung</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Mobile Zeiterfassung mit Korrektur-Workflow</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Touren für wiederkehrende Rundgänge</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/schedule</span></div>
              <div class="app"><div class="pane">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                  <div><div class="h1app">Wochenplanung</div><div class="sub">KW 34 · 18.–24. August</div></div>
                  <span class="pill neut plain">‹ Woche ›</span>
                </div>
                <div class="panel" style="overflow:hidden;">
                  <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:1px; background:var(--line-soft);">
                    <div style="background:#fff; padding:8px 10px; font-size:11px; color:var(--muted); font-weight:600;">Mo 18.</div>
                    <div style="background:#fff; padding:8px 10px; font-size:11px; color:var(--muted); font-weight:600;">Di 19.</div>
                    <div style="background:#fff; padding:8px 10px; font-size:11px; color:var(--muted); font-weight:600;">Mi 20.</div>
                    <div style="background:#fff; padding:8px 10px; font-size:11px; color:var(--muted); font-weight:600;">Do 21.</div>
                    <div style="background:#fff; padding:8px 10px; font-size:11px; color:var(--muted); font-weight:600;">Fr 22.</div>
                    <div style="background:#fff; padding:8px; min-height:96px; display:flex; flex-direction:column; gap:6px;"><span class="pill info plain" style="justify-content:flex-start; background:var(--info-bg); color:var(--blue); font-size:10.5px;">Lindenhof · Rundgang</span><span class="pill neut plain" style="justify-content:flex-start; font-size:10.5px;">Grünpflege</span></div>
                    <div style="background:#fff; padding:8px; display:flex; flex-direction:column; gap:6px;"><span class="pill warn plain" style="justify-content:flex-start; background:var(--warn-bg); color:var(--amber-deep); font-size:10.5px;">Sonnenallee · Reinigung</span></div>
                    <div style="background:#fff; padding:8px; display:flex; flex-direction:column; gap:6px;"><span class="pill info plain" style="justify-content:flex-start; background:var(--info-bg); color:var(--blue); font-size:10.5px;">Ärztehaus · Technik</span><span class="pill ok plain" style="justify-content:flex-start; background:var(--ok-bg); color:var(--ok-fg); font-size:10.5px;">Wartung Aufzug</span></div>
                    <div style="background:#fff; padding:8px; display:flex; flex-direction:column; gap:6px;"><span class="pill neut plain" style="justify-content:flex-start; font-size:10.5px;">Havelblick · Fassade</span></div>
                    <div style="background:#fff; padding:8px; display:flex; flex-direction:column; gap:6px;"><span class="pill info plain" style="justify-content:flex-start; background:var(--info-bg); color:var(--blue); font-size:10.5px;">Tour Nord (4 Stopps)</span></div>
                  </div>
                </div>
                <div class="panel" style="margin-top:12px;">
                  <div class="row"><span class="ic tint-green"><svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span><div class="gro"><b>Zeiterfassung läuft — Maik Krüger</b><span>Eingestempelt 07:12 · Lindenhof</span></div><span class="mono strong">03:48 h</span></div>
                </div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 5 · RESSOURCEN -->
        <div class="feature reveal" id="ressourcen">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Ressourcen</span>
            <h3>Material, Fahrzeuge und Dokumente — immer griffbereit.</h3>
            <p class="desc">Behalten Sie Lagerbestände, Ihren Fuhrpark samt TÜV-Fristen und alle Dokumente und Fotos im Blick. Per QR-Code ist jedes Objekt und jeder Zähler in Sekunden aufgerufen.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Materialbestand mit Mindestmengen &amp; Warnung</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Fahrzeuge mit TÜV- &amp; Wartungsfristen</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Dokumente, Fotos &amp; QR-Codes je Objekt</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/materials</span></div>
              <div class="app"><div class="pane">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                  <div><div class="h1app">Material &amp; Fuhrpark</div><div class="sub">Lagerbestand Zentrale</div></div>
                </div>
                <div class="panel" style="margin-bottom:12px;"><table class="tbl">
                  <thead><tr><th>Artikel</th><th>Bestand</th><th>Mindest</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr><td class="strong">Streusalz (25 kg)</td><td class="mono">8 Sack</td><td class="mono">20</td><td><span class="pill bad">Nachbestellen</span></td></tr>
                    <tr><td class="strong">LED-Leuchtmittel E27</td><td class="mono">64 St.</td><td class="mono">30</td><td><span class="pill ok">OK</span></td></tr>
                    <tr><td class="strong">Filter Lüftung F7</td><td class="mono">12 St.</td><td class="mono">15</td><td><span class="pill warn">Knapp</span></td></tr>
                  </tbody>
                </table></div>
                <div class="grid2">
                  <div class="panel" style="padding:13px;"><div style="display:flex; gap:11px; align-items:center;"><span class="ic tint-slate" style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none;"><svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M2 13h13v-3l-2-4H2zM15 9h3l1 4h-4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="6" cy="14" r="1.6" stroke="currentColor" stroke-width="1.4"/><circle cx="15" cy="14" r="1.6" stroke="currentColor" stroke-width="1.4"/></svg></span><div><div class="strong">VW Caddy · B-HS 1234</div><div class="sub">TÜV bis 03/2027</div></div></div><div style="margin-top:9px;"><span class="pill ok">Verfügbar</span></div></div>
                  <div class="panel" style="padding:13px;"><div style="display:flex; gap:11px; align-items:center;"><span class="ic tint-amber" style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none;"><svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M2 13h13v-3l-2-4H2zM15 9h3l1 4h-4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="6" cy="14" r="1.6" stroke="currentColor" stroke-width="1.4"/><circle cx="15" cy="14" r="1.6" stroke="currentColor" stroke-width="1.4"/></svg></span><div><div class="strong">Piaggio Porter · B-HS 88</div><div class="sub">TÜV in 6 Wochen</div></div></div><div style="margin-top:9px;"><span class="pill warn">TÜV fällig</span></div></div>
                </div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 6 · KOMMUNIKATION -->
        <div class="feature flip reveal" id="kommunikation">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Kommunikation</span>
            <h3>Alle im Bilde — ohne WhatsApp-Chaos.</h3>
            <p class="desc">Interne Nachrichten und Aushänge laufen direkt in der Software. Ankündigungen erreichen genau die richtigen Objekte und Teams — nachvollziehbar dokumentiert statt verstreut auf privaten Handys.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Direktnachrichten im Team</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Ankündigungen je Objekt &amp; Zielgruppe</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Alles dokumentiert — jederzeit nachlesbar</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/messages</span></div>
              <div class="app"><div class="pane" style="display:flex; flex-direction:column; gap:12px;">
                <div><div class="h1app">Nachrichten</div><div class="sub">Team Objektbetreuung</div></div>
                <div class="panel" style="padding:14px; display:flex; flex-direction:column; gap:10px;">
                  <div style="display:flex; gap:9px; align-items:flex-end;"><span class="ava" style="background:#0e7490">AV</span><div style="background:var(--paper-2); border:1px solid var(--line); border-radius:12px 12px 12px 4px; padding:8px 12px; font-size:12.5px; max-width:78%;">Tiefgaragentor Lindenhof klemmt wieder. Kann jemand heute schauen?<br><span class="mono" style="font-size:10px; color:var(--muted);">08:41</span></div></div>
                  <div style="display:flex; gap:9px; align-items:flex-end; flex-direction:row-reverse;"><span class="ava" style="background:#1e40af">MK</span><div style="background:var(--info-bg); border:1px solid #dbe6fb; border-radius:12px 12px 4px 12px; padding:8px 12px; font-size:12.5px; max-width:78%;">Bin um 13 Uhr vor Ort. Auftrag ist angelegt. 👍<br><span class="mono" style="font-size:10px; color:var(--muted);">08:47</span></div></div>
                </div>
                <div class="panel">
                  <div class="ph"><h5>Ankündigung an alle Bewohner</h5><span class="pill warn">Geplant</span></div>
                  <div class="row"><span class="ic tint-amber"><svg viewBox="0 0 20 20" fill="none"><path d="M4 8v4l9 4V4L4 8zM4 8H3v4h1" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span><div class="gro"><b>Wasserabstellung Havelblick · 26.08.</b><span>An: 5 Objekte · 214 Einheiten</span></div></div>
                </div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 7 · FINANZEN -->
        <div class="feature reveal" id="finanzen">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Finanzen</span>
            <h3>Von der Leistung zur Rechnung — und zum Bericht.</h3>
            <p class="desc">Erfasste Zeiten und Leistungen werden zur Abrechnung. Auswertungen zeigen Stunden je Objekt, Auslastung und Umsatz — die Zahlen, mit denen Sie Ihren Betrieb wirklich steuern.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Abrechnung auf Basis echter Einsätze</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Auswertungen zu Stunden, Auslastung &amp; Umsatz</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Exporte für die Buchhaltung</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/reports</span></div>
              <div class="app"><div class="pane" style="display:flex; flex-direction:column; gap:12px;">
                <div><div class="h1app">Reporting</div><div class="sub">Stunden je Objekt · August 2026</div></div>
                <div class="panel" style="padding:16px 16px 10px;">
                  <div style="display:flex; align-items:flex-end; gap:16px; height:132px; padding-left:4px; border-bottom:1px solid var(--line); border-left:1px solid var(--line);">
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;"><div style="width:72%; height:104px; background:linear-gradient(var(--blue),#3b64d1); border-radius:5px 5px 0 0;"></div></div>
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;"><div style="width:72%; height:72px; background:linear-gradient(var(--blue),#3b64d1); border-radius:5px 5px 0 0;"></div></div>
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;"><div style="width:72%; height:58px; background:linear-gradient(var(--amber),#f0b429); border-radius:5px 5px 0 0;"></div></div>
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;"><div style="width:72%; height:88px; background:linear-gradient(var(--blue),#3b64d1); border-radius:5px 5px 0 0;"></div></div>
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;"><div style="width:72%; height:44px; background:linear-gradient(var(--blue),#3b64d1); border-radius:5px 5px 0 0;"></div></div>
                  </div>
                  <div style="display:flex; gap:16px; margin-top:8px; font-size:10.5px; color:var(--muted); text-align:center;">
                    <span style="flex:1;">Lindenhof</span><span style="flex:1;">Sonnenallee</span><span style="flex:1;">Ärztehaus</span><span style="flex:1;">Havelblick</span><span style="flex:1;">Schule</span>
                  </div>
                </div>
                <div class="panel"><table class="tbl">
                  <thead><tr><th>Rechnung</th><th>Objekt</th><th>Betrag</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr><td class="mono">RE-2026-0184</td><td>Lindenhof</td><td class="strong">1.240,00 €</td><td><span class="pill ok">Bezahlt</span></td></tr>
                    <tr><td class="mono">RE-2026-0185</td><td>Sonnenallee</td><td class="strong">860,00 €</td><td><span class="pill warn">Offen</span></td></tr>
                    <tr><td class="mono">RE-2026-0186</td><td>Havelblick</td><td class="strong">1.075,00 €</td><td><span class="pill neut">Entwurf</span></td></tr>
                  </tbody>
                </table></div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 8 · EINSTELLUNGEN -->
        <div class="feature flip reveal" id="einstellungen">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Einstellungen</span>
            <h3>Ihr Betrieb, Ihre Regeln.</h3>
            <p class="desc">Legen Sie Rollen und Rechte fein granular fest, pflegen Sie Mandanten- und Rechnungsdaten und aktivieren Sie nur die Module, die Sie wirklich brauchen. Alles unter Ihrer Kontrolle.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Benutzer &amp; Rollen nach dem Least-Privilege-Prinzip</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Firmen- &amp; Rechnungsdaten zentral gepflegt</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Module an- und abschaltbar</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/settings/users</span></div>
              <div class="app"><div class="pane">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                  <div><div class="h1app">Benutzer &amp; Rollen</div><div class="sub">Rechte je Rolle</div></div>
                </div>
                <div class="panel"><table class="tbl">
                  <thead><tr><th>Recht</th><th style="text-align:center">Inhaber</th><th style="text-align:center">Vorarbeiter</th><th style="text-align:center">Mitarbeiter</th></tr></thead>
                  <tbody>
                    <tr><td class="strong">Aufträge verwalten</td><td style="text-align:center"><span class="pill ok plain" style="padding:2px 7px">✓</span></td><td style="text-align:center"><span class="pill ok plain" style="padding:2px 7px">✓</span></td><td style="text-align:center"><span class="pill neut plain" style="padding:2px 7px">nur eigene</span></td></tr>
                    <tr><td class="strong">Objekte &amp; Schlüssel</td><td style="text-align:center"><span class="pill ok plain" style="padding:2px 7px">✓</span></td><td style="text-align:center"><span class="pill ok plain" style="padding:2px 7px">✓</span></td><td style="text-align:center"><span class="pill neut plain" style="padding:2px 7px">lesen</span></td></tr>
                    <tr><td class="strong">Abrechnung &amp; Finanzen</td><td style="text-align:center"><span class="pill ok plain" style="padding:2px 7px">✓</span></td><td style="text-align:center"><span class="pill bad plain" style="padding:2px 7px">—</span></td><td style="text-align:center"><span class="pill bad plain" style="padding:2px 7px">—</span></td></tr>
                    <tr><td class="strong">Benutzer verwalten</td><td style="text-align:center"><span class="pill ok plain" style="padding:2px 7px">✓</span></td><td style="text-align:center"><span class="pill bad plain" style="padding:2px 7px">—</span></td><td style="text-align:center"><span class="pill bad plain" style="padding:2px 7px">—</span></td></tr>
                  </tbody>
                </table></div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 9 · AUTOMATISIERUNG -->
        <div class="feature reveal" id="automatisierung">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Automatisierung</span>
            <h3>Routine läuft von selbst.</h3>
            <p class="desc">Definieren Sie einfache Wenn-dann-Regeln — ganz ohne Technikwissen. Wird eine Wartung fällig, entsteht automatisch ein Auftrag. Geht eine Meldung ein, wird das Team informiert. Sie sparen die Handgriffe, die jeden Tag anfallen.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Wenn-dann-Regeln in Klartext</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Automatische Aufgaben &amp; Erinnerungen</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Weniger Handarbeit, weniger Vergessen</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/settings/automations</span></div>
              <div class="app"><div class="pane" style="display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                  <div><div class="h1app">Automatisierungen</div><div class="sub">3 aktive Regeln</div></div>
                </div>
                <div class="panel" style="padding:14px; display:flex; flex-direction:column; gap:11px;">
                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span class="pill neut plain" style="background:var(--paper-2)">WENN</span>
                    <span class="strong" style="font-size:12.5px;">Wartung fällig in 7 Tagen</span>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="color:var(--muted)"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span class="pill info plain" style="background:var(--info-bg); color:var(--blue)">DANN</span>
                    <span class="strong" style="font-size:12.5px;">Auftrag anlegen + zuweisen</span>
                    <span style="margin-left:auto;" class="pill ok">Aktiv</span>
                  </div>
                </div>
                <div class="panel" style="padding:14px; display:flex; flex-direction:column; gap:11px;">
                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span class="pill neut plain" style="background:var(--paper-2)">WENN</span>
                    <span class="strong" style="font-size:12.5px;">Neue Schadensmeldung</span>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="color:var(--muted)"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span class="pill info plain" style="background:var(--info-bg); color:var(--blue)">DANN</span>
                    <span class="strong" style="font-size:12.5px;">Vorarbeiter benachrichtigen</span>
                    <span style="margin-left:auto;" class="pill ok">Aktiv</span>
                  </div>
                </div>
                <div class="panel" style="padding:14px; display:flex; flex-direction:column; gap:11px;">
                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; opacity:.62;">
                    <span class="pill neut plain" style="background:var(--paper-2)">WENN</span>
                    <span class="strong" style="font-size:12.5px;">Materialbestand unter Mindestmenge</span>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="color:var(--muted)"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span class="pill info plain" style="background:var(--info-bg); color:var(--blue)">DANN</span>
                    <span class="strong" style="font-size:12.5px;">Erinnerung an Inhaber</span>
                    <span style="margin-left:auto;" class="pill neut">Pausiert</span>
                  </div>
                </div>
              </div></div>
            </div>
          </div>
        </div>

        <!-- 10 · HILFE & KONTAKT -->
        <div class="feature flip reveal" id="hilfe">
          <div class="copy">
            <span class="eyebrow"><span class="tick"></span>Hilfe &amp; Kontakt</span>
            <h3>Sie sind nie allein.</h3>
            <p class="desc">Ein Assistent führt Sie durch die ersten Schritte, eine durchsuchbare Hilfe beantwortet die häufigsten Fragen, und der persönliche Kontakt ist immer nur einen Klick entfernt — Support aus Deutschland.</p>
            <ul class="checks">
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>„Erste Schritte"-Assistent — jederzeit erneut aufrufbar</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Hilfe-Center mit Antworten auf einen Blick</li>
              <li><span class="cbox"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Persönlicher Support aus Deutschland</li>
            </ul>
          </div>
          <div class="shot">
            <div class="win">
              <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="win-url">hausmeisterservice.vaydena.de/hilfe</span></div>
              <div class="app"><div class="pane" style="display:flex; flex-direction:column; gap:12px;">
                <div><div class="h1app">Hilfe &amp; Kontakt</div><div class="sub">Wir helfen weiter</div></div>
                <div class="panel" style="padding:14px; display:flex; align-items:center; gap:12px; background:linear-gradient(90deg,var(--info-bg),#fff);">
                  <span class="ic tint-blue" style="width:40px;height:40px;border-radius:11px;display:grid;place-items:center;flex:none;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 5h12M4 10h12M4 15h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
                  <div style="flex:1;"><div class="strong">Erste Schritte</div><div class="sub">Der Assistent zeigt die vier Schritte für Ihren Start.</div></div>
                  <span class="pill info plain" style="background:var(--blue); color:#fff; padding:7px 12px;">Öffnen →</span>
                </div>
                <div class="panel">
                  <div class="ph"><h5>Häufige Fragen</h5></div>
                  <div class="rows">
                    <div class="row"><div class="gro"><b>Wie lege ich ein neues Objekt an?</b></div><svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="color:var(--muted)"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="row"><div class="gro"><b>Wie erfassen Mitarbeiter ihre Zeiten?</b></div><svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="color:var(--muted)"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="row"><div class="gro"><b>Wie stelle ich eine Rechnung?</b></div><svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="color:var(--muted)"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                  </div>
                </div>
              </div></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ============================ PREISE / ZAHLUNG ============================ -->
  <section class="band alt" id="preise">
    <div class="wrap">
      <div class="sec-head reveal" style="max-width:760px;">
        <span class="eyebrow"><span class="tick"></span>Preise &amp; Abrechnung</span>
        <h2>Faire Tarife. Zahlen, wie es Ihnen passt.</h2>
        <p>Monatlich oder jährlich, jederzeit kündbar. Wählen Sie den Umfang, der zu Ihrem Betrieb passt — und starten Sie mit 14 Tagen kostenlos, ganz ohne Kreditkarte.</p>
      </div>

      <div class="tiers reveal">
        <div class="tier">
          <div class="tname">Starter</div>
          <div class="tfor">Für Ein-Mann-Betriebe &amp; kleine Teams, die Ordnung schaffen wollen.</div>
          <div class="cap">
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Bis 5 Mitarbeiter, bis 10 Objekte</div>
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Aufträge, Objekte, Personen</div>
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Zeiterfassung &amp; Checklisten</div>
          </div>
          <a class="btn btn-ghost-light" href="/preise">Details ansehen</a>
        </div>

        <div class="tier pop">
          <div class="tname">Profi</div>
          <div class="tfor">Für wachsende Betriebe mit mehreren Teams und Objekten.</div>
          <div class="cap">
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Bis 20 Mitarbeiter, bis 50 Objekte</div>
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Planung, Schichten &amp; Touren</div>
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Automatisierung &amp; Reporting</div>
          </div>
          <a class="btn btn-amber" href="/signup">Jetzt kostenlos testen</a>
        </div>

        <div class="tier">
          <div class="tname">Premium</div>
          <div class="tfor">Für große Dienstleister mit vielen Objekten und Anspruch.</div>
          <div class="cap">
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Unbegrenzt Mitarbeiter &amp; Objekte</div>
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Alle Module inklusive</div>
            <div><span class="ck"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Bevorzugter Support</div>
          </div>
          <a class="btn btn-ghost-light" href="/preise">Details ansehen</a>
        </div>
      </div>

      <div class="pay reveal">
        <span style="font-size:14px; color:var(--muted); width:100%; text-align:center; margin-bottom:2px;">Bezahlen Sie bequem und ohne Kreditkarte:</span>
        <span class="chip"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 7l7-3 7 3v1H3zM4 9v6M8 9v6M12 9v6M16 9v6M3 16h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Banküberweisung</span>
        <span class="chip"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM13 12h1M16 12h1M12 15h1M15 15h2M12 17h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>GiroCode-QR</span>
        <span class="chip"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M6 16l1.6-9h4.2c2.2 0 3.4 1.2 3 3.2-.4 2-2 3-4.2 3H8.4L8 16H6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>PayPal</span>
      </div>
    </div>
  </section>

  <!-- ============================ FINAL CTA ============================ -->
  <section class="cta on-navy">
    <div class="wrap cta-in reveal">
      <h2>Bringen Sie Ordnung in Ihren Betrieb.</h2>
      <p>In wenigen Minuten startklar. Testen Sie Hausmeisterservice 14 Tage kostenlos — unverbindlich und ohne Kreditkarte.</p>
      <div class="cta-row">
        <a class="btn btn-amber" href="/signup">14 Tage kostenlos testen <svg class="arw" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10h11M11 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <a class="btn btn-ghost-navy" href="/login">Anmelden</a>
      </div>
    </div>
  </section>

  <!-- ============================ FOOTER ============================ -->
  <footer class="ft">
    <div class="wrap ft-in">
      <div>
        <a class="brand" href="#top"><span class="logo">HS</span>Hausmeisterservice</a>
        <p class="tag">Die komplette Hausmeistersoftware für Hausmeister- und Gebäudedienste. Alle Bereiche, ein Login.</p>
      </div>
      <div>
        <h6>Produkt</h6>
        <ul>
          <li><a href="#bereiche">Bereiche</a></li>
          <li><a href="#preise">Preise</a></li>
          <li><a href="/signup">Registrieren</a></li>
          <li><a href="/login">Anmelden</a></li>
        </ul>
      </div>
      <div>
        <h6>Rechtliches</h6>
        <ul>
          <li><a href="/impressum">Impressum</a></li>
          <li><a href="/datenschutz">Datenschutz</a></li>
          <li><a href="/agb">AGB</a></li>
          <li><a href="/avv">AVV</a></li>
        </ul>
      </div>
      <div>
        <h6>Kontakt</h6>
        <ul>
          <li><a href="mailto:kontakt@vaydena.de">Hilfe &amp; Kontakt</a></li>
          <li><a href="mailto:kontakt@vaydena.de">kontakt@vaydena.de</a></li>
        </ul>
      </div>
    </div>
    <div class="wrap ft-bottom">
      <span>© {{YEAR}} Hausmeisterservice · vaydena.de</span>
      <span class="made"><span class="flag"><i class="b"></i><i class="r"></i><i class="g"></i></span> Entwickelt &amp; gehostet in Deutschland</span>
    </div>
  </footer>
`;
