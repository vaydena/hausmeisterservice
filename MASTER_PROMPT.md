# MASTER-PROMPT FÜR CLAUDE CODE

**Entwicklung einer umfassenden Hausmeisterservice- und Objektmanagement-Plattform**

Du bist ein Senior Software Architect, Senior Full-Stack Developer, UX/UI Designer, Product Manager und Security Engineer.

Deine Aufgabe ist es, eine moderne, professionelle und vollständig nutzbare Hausmeisterservice- und Objektmanagement-Plattform zu entwickeln.

Die Anwendung soll nicht wie eine einfache To-do-App wirken, sondern wie eine professionelle SaaS-Lösung, die ein kompletter Hausmeisterservice für die tägliche Organisation seiner Mitarbeiter, Objekte, Gebäude, Bewohner, Eigentümer, Aufträge, Wartungen, Fahrzeuge, Materialien, Dokumente und Kommunikation einsetzen kann.

Die Anwendung soll sowohl auf Desktop als auch Tablet und Smartphone hervorragend funktionieren.

---

## 1. GRUNDIDEE DER PLATTFORM

Die Software soll die komplette digitale Organisation eines Hausmeisterservices ermöglichen.

Sie soll insbesondere folgende Bereiche abdecken:

- Verwaltung von Hausmeisterobjekten
- Gebäude- und Liegenschaftsverwaltung
- Wohnungen und Einheiten
- Bewohner
- Eigentümer
- Mitarbeiter
- Aufträge
- Arbeitsaufträge
- Wartungen
- Prüfungen
- Reparaturen
- Mängel
- Störungen
- Schadensmeldungen
- wiederkehrende Aufgaben
- Objektbegehungen
- Kontrollgänge
- Reinigungsarbeiten
- Grünanlagenpflege
- Winterdienst
- Verkehrssicherung
- technische Anlagen
- Schlüsselverwaltung
- Zählerstände
- Materialverwaltung
- Lager
- Fahrzeuge
- Werkzeug
- Dokumente
- Fotos
- Arbeitsberichte
- Checklisten
- Zeiterfassung
- Mitarbeiterplanung
- Schichtplanung
- Tourenplanung
- GPS
- Karten
- Kommunikation
- Benachrichtigungen
- Eigentümerportal
- Bewohnerportal
- Abrechnung
- Rechnungen
- Kosten
- Auswertungen
- Statistiken
- Reporting
- Benutzerverwaltung
- Rollen und Rechte
- Audit-Log
- Einstellungen
- Automatisierungen

---

## 2. WICHTIG: MODULARES SYSTEM

Die Plattform muss modular aufgebaut werden.
Der Administrator soll in den Einstellungen einzelne Module aktivieren oder deaktivieren können.

Beispielsweise:

- Auftragsverwaltung
- Bewohnerportal
- Eigentümerportal
- Zeiterfassung
- GPS
- Tourenplanung
- Fahrzeugverwaltung
- Materialverwaltung
- Schlüsselverwaltung
- Zählerverwaltung
- Dokumentenverwaltung
- Wartungsverwaltung
- Abrechnung
- Kommunikation
- Benachrichtigungen
- Mitarbeiterplanung
- Schichtplanung
- Checklisten
- Arbeitsberichte

Wenn ein Modul deaktiviert ist, darf es im Frontend nicht unnötig angezeigt werden.
Die Architektur muss so aufgebaut sein, dass später problemlos weitere Module hinzugefügt werden können.

---

## 3. MULTI-TENANT-SAAS-ARCHITEKTUR

Die Anwendung soll grundsätzlich für mehrere Hausmeisterunternehmen geeignet sein.
Jedes Unternehmen besitzt einen eigenen Mandanten.
Daten verschiedener Unternehmen müssen vollständig voneinander getrennt sein.

Beispiel: Unternehmen A darf niemals Daten von Unternehmen B sehen.

Berücksichtige:

- Tenant-ID
- Benutzerzuordnung
- Rollen
- Berechtigungen
- Datenisolierung
- Mandanteneinstellungen
- eigene Logos
- Unternehmensdaten
- eigene Benachrichtigungseinstellungen
- eigene Dokumentvorlagen
- eigene Rechnungsdaten
- eigene Nummernkreise

---

## 4. BENUTZER UND ROLLEN

Die Anwendung darf NICHT auf feste Rollen beschränkt sein.
Der Administrator muss Rollen selbst erstellen und individuell konfigurieren können.

Standardmäßig können beispielsweise folgende Rollen angeboten werden:

- Superadministrator
- Administrator
- Objektleiter
- Disponent
- Hausmeister
- Technischer Mitarbeiter
- Reinigungskraft
- Winterdienst-Mitarbeiter
- Gärtner
- Fahrer
- Buchhaltung
- Eigentümer
- Hausverwaltung
- Bewohner
- externer Dienstleister

Diese Rollen dienen nur als Vorlage.
Der Administrator muss eigene Rollen erstellen können.
Rechte müssen granular sein.

Beispielsweise:

**Objekte:** ansehen, erstellen, bearbeiten, löschen
**Aufträge:** ansehen, erstellen, bearbeiten, zuweisen, abschließen, löschen
**Bewohner:** ansehen, bearbeiten, erstellen, löschen
**Rechnungen:** ansehen, erstellen, bearbeiten, freigeben, versenden, löschen
**GPS:** anzeigen, eigene Position, Mitarbeiterpositionen anzeigen
**Dokumente:** ansehen, hochladen, bearbeiten, löschen, herunterladen

Zusätzlich:

- Rechte pro Modul
- Rechte pro Funktion
- Rechte pro Objekt
- Rechte pro Standort
- Rechte pro Benutzergruppe

---

## 5. DASHBOARD

Nach Login soll jeder Benutzer ein individuelles Dashboard erhalten.
Das Dashboard richtet sich nach seinen Berechtigungen.

### Administrator
Anzeigen:
- offene Aufträge
- überfällige Aufträge
- heutige Aufgaben
- morgige Aufgaben
- anstehende Wartungen
- offene Mängel
- neue Bewohnermeldungen
- neue Eigentümermeldungen
- Mitarbeiter im Einsatz
- Mitarbeiter krank/abwesend
- Arbeitsstunden
- Fahrzeuge
- offene Fahrzeugwartungen
- Materialbestand
- kritische Lagerbestände
- bevorstehende Prüfungen
- wichtige Dokumente
- aktuelle Störungen
- aktuelle Notfälle

### Mitarbeiter
Anzeigen:
- heutige Aufgaben
- nächste Aufgaben
- eigene Arbeitszeit
- aktuelle Tour
- offene Arbeitsaufträge
- überfällige Aufgaben
- Objektinformationen
- Checklisten
- Meldungen
- Nachrichten

### Bewohner
Anzeigen:
- aktuelle Informationen
- geplante Arbeiten
- bevorstehende Wartungen
- Sperrungen
- Störungen
- eigene Meldungen
- Status eigener Meldungen
- Dokumente
- Nachrichten

### Eigentümer
Zusätzlich:
- eigene Objekte
- Objektstatus
- offene Mängel
- Kosten
- Rechnungen
- Wartungen
- Berichte
- Dokumente

---

## 6. OBJEKTVERWALTUNG

Ein Objekt soll sehr detailliert verwaltet werden können.

**Struktur:**
Unternehmen → Liegenschaft → Gebäude → Haus → Eingang → Etage → Einheit/Wohnung → Räume/Anlagen

**Objektdaten:**
- Objektname
- Objekt-ID
- Adresse
- GPS-Koordinaten
- Ansprechpartner
- Eigentümer
- Hausverwaltung
- Anzahl Gebäude
- Anzahl Wohnungen
- Baujahr
- Objektart
- technische Besonderheiten
- Notfallinformationen
- Öffnungszeiten
- Zugangshinweise
- Schlüsselinformationen
- Ansprechpartner
- Telefonnummern
- E-Mail-Adressen

---

## 7. SEHR UMFANGREICHE HAUSMEISTERAUFGABEN

Das System soll Hausmeisteraufgaben kategorisieren können.

### Allgemeine Objektkontrolle
- täglicher Kontrollgang
- wöchentlicher Kontrollgang
- monatliche Kontrolle
- Sichtprüfung Gebäude
- Kontrolle Gemeinschaftsflächen
- Kontrolle Keller
- Kontrolle Dachboden
- Kontrolle Tiefgarage
- Kontrolle Außenanlagen
- Kontrolle Beleuchtung
- Kontrolle Türen
- Kontrolle Fenster
- Kontrolle Briefkastenanlagen
- Kontrolle Beschilderung
- Kontrolle Geländer
- Kontrolle Treppenhäuser

### Reinigung
- Treppenhausreinigung
- Eingangsreinigung
- Flurreinigung
- Kellerreinigung
- Tiefgaragenreinigung
- Müllraumreinigung
- Waschkellerreinigung
- Aufzugsreinigung
- Fensterreinigung
- Glasreinigung
- Gemeinschaftsraumreinigung
- Außenflächenreinigung

### Grünanlagen
- Rasen mähen
- Rasenpflege
- Unkraut entfernen
- Hecken schneiden
- Sträucher schneiden
- Bäume kontrollieren
- Laub entfernen
- Beete pflegen
- Pflanzen bewässern
- Bewässerungsanlagen kontrollieren
- Pflanzen ersetzen
- Grünflächen kontrollieren

### Winterdienst
- Schnee kontrollieren
- Schnee räumen
- Streuen
- Glätte kontrollieren
- Eis entfernen
- Streugut auffüllen
- Winterdienst dokumentieren
- Einsatzzeiten erfassen
- Wetterlage dokumentieren
- Fotos aufnehmen

### Müllmanagement
- Mülltonnen kontrollieren
- Mülltonnen bereitstellen
- Mülltonnen zurückstellen
- Müllplätze reinigen
- Sperrmüll kontrollieren
- illegale Müllablagerungen melden
- Mülltermine verwalten
- Müllkalender

### Technische Anlagen
- Heizungsanlage kontrollieren
- Warmwasseranlage kontrollieren
- Lüftung kontrollieren
- Beleuchtung kontrollieren
- Aufzüge kontrollieren
- Pumpen kontrollieren
- Wasseranlagen kontrollieren
- Druckanlagen
- Rauchmelder
- Brandschutzeinrichtungen
- Notbeleuchtung
- elektrische Anlagen Sichtprüfung
- Türen
- Tore
- Garagentore
- Schrankenanlagen
- Klingelanlagen
- Sprechanlagen
- Briefkastenanlagen

### Außenanlagen
- Wege kontrollieren
- Zufahrten kontrollieren
- Parkplätze kontrollieren
- Beleuchtung kontrollieren
- Zäune kontrollieren
- Tore kontrollieren
- Spielplätze kontrollieren
- Bänke kontrollieren
- Fahrradstellplätze kontrollieren

### Sicherheit und Verkehrssicherung
- Stolperstellen
- beschädigte Bodenbeläge
- lose Handläufe
- defekte Beleuchtung
- beschädigte Türen
- beschädigte Fenster
- Gefahrenstellen
- Eisbildung
- Schneelage
- herabfallende Äste
- beschädigte Zäune
- offene Schächte
- beschädigte Spielgeräte

Jede Aufgabe soll als Checkliste, Auftrag oder wiederkehrende Aufgabe angelegt werden können.

---

## 8. AUFTRAGSMANAGEMENT

Aufträge müssen beispielsweise folgende Status besitzen:
- Neu
- Eingegangen
- Prüfung erforderlich
- Geplant
- Zugewiesen
- In Bearbeitung
- Wartet auf Material
- Wartet auf Dienstleister
- Wartet auf Freigabe
- Erledigt
- Abgenommen
- Abgebrochen

Aufträge sollen enthalten:
- Titel
- Beschreibung
- Kategorie
- Priorität
- Objekt
- Gebäude
- Einheit
- Ersteller
- zuständiger Mitarbeiter
- Team
- Termin
- Deadline
- geschätzte Dauer
- tatsächliche Dauer
- Material
- Kosten
- Fotos
- Dokumente
- Kommentare
- Checkliste
- GPS-Position
- Arbeitsbericht

Prioritäten: niedrig, normal, hoch, dringend, Notfall

---

## 9. BEWOHNER-MÄNGELMELDUNGEN

Bewohner sollen Mängel einfach melden können.

Beispielsweise:
- Heizung defekt
- Wasserhahn defekt
- Wasserschaden
- Licht defekt
- Aufzug defekt
- Tür defekt
- Fenster defekt
- Gegensprechanlage defekt
- Müllproblem
- Parkplatzproblem
- Lärmbelästigung
- Feuchtigkeit
- Schimmelhinweis
- Schädlingsproblem
- sonstiger Mangel

Möglichkeit:
- Foto hochladen
- Video hochladen
- Beschreibung
- Standort
- Raum
- Priorität
- Erreichbarkeit
- Terminwunsch

Danach:
Meldung → Prüfung → Auftrag → Mitarbeiter → Bearbeitung → Abschluss → Rückmeldung

Der Bewohner soll jederzeit den Status sehen können.

---

## 10. ARBEITEN UND WARTUNGEN ANKÜNDIGEN

Ein besonders wichtiges Modul.
Hausmeisterservice oder Verwaltung kann Arbeiten ankündigen.

Beispiele:
- "Am Dienstag wird die Heizungsanlage gewartet."
- "Am Donnerstag findet eine Prüfung der Rauchmelder statt."
- "Am Samstag wird die Tiefgarage gereinigt."
- "Aufgrund von Reparaturarbeiten ist der Hauseingang von 09:00 bis 13:00 Uhr eingeschränkt nutzbar."

Ankündigung mit:
- Titel
- Beschreibung
- Objekt
- Gebäude
- betroffene Wohnungen
- Datum
- Uhrzeit
- Dauer
- Ansprechpartner
- Hinweise
- Anhänge
- Bilder

Benachrichtigungen: Push, E-Mail, In-App, optional SMS

---

## 11. WARTUNGSPLANUNG

Wartungen müssen einmalig und wiederkehrend geplant werden können.

Beispiele:
- Heizungswartung
- Aufzugswartung
- Rauchmelderprüfung
- Brandschutzprüfung
- Dachkontrolle
- Dachrinnenreinigung
- Torwartung
- Garagentorwartung
- Pumpenwartung
- Lüftungswartung
- Beleuchtungsprüfung
- Spielplatzkontrolle
- elektrische Prüfungen
- Feuerlöscherprüfung
- Trinkwasserprüfung
- Legionellenprüfung
- Außenanlagenkontrolle

Wiederholungen: täglich, wöchentlich, monatlich, quartalsweise, halbjährlich, jährlich, individuelle Intervalle

Automatische Erinnerung vor Fälligkeit.

---

## 12. CHECKLISTEN

Ein leistungsfähiger Checklisten-Builder.
Administrator kann eigene Checklisten erstellen.

Elemente:
- Ja/Nein
- Checkbox
- Text
- Zahl
- Auswahl
- Datum
- Uhrzeit
- Foto erforderlich
- Unterschrift
- Kommentar
- Messwert

Beispiel "Monatliche Objektkontrolle":
- ☐ Eingangsbereich sauber
- ☐ Beleuchtung funktionsfähig
- ☐ Türen funktionsfähig
- ☐ Briefkästen intakt
- ☐ Treppenhaus kontrolliert
- ☐ Keller kontrolliert
- ☐ Außenanlage kontrolliert
- ☐ Müllplatz kontrolliert

---

## 13. ARBEITSBERICHTE

Mitarbeiter sollen nach einer Tätigkeit einen Arbeitsbericht erstellen können.

Daten:
- Auftrag
- Objekt
- Tätigkeit
- Beginn
- Ende
- Arbeitszeit
- Mitarbeiter
- Beschreibung
- Material
- Fotos vorher
- Fotos nachher
- Messwerte
- Bemerkungen
- Unterschrift

PDF-Arbeitsbericht generieren.

---

## 14. ZEITERFASSUNG

Integriere eine vollständige Arbeitszeiterfassung.

Funktionen:
- Arbeitsbeginn
- Arbeitsende
- Pause
- Unterbrechung
- Dienstgang
- Fahrtzeit
- Arbeitszeit
- Überstunden
- Korrekturanträge

Optional: GPS beim Einstempeln, Geofence, Objektzuordnung, Auftragzuordnung

Monatliche Auswertung: Sollstunden, Iststunden, Überstunden, Abwesenheiten, Urlaub, Krankheit, Feiertage

---

## 15. MITARBEITERPLANUNG

Kalenderbasierte Planung.

Darstellung: Tag, Woche, Monat

Planbar: Mitarbeiter, Schichten, Aufgaben, Objekte, Touren, Abwesenheiten, Urlaub, Wartungen, Sonderaufgaben

Drag & Drop.

---

## 16. TOURENPLANUNG

Mitarbeiter sollen mehrere Objekte pro Tag abarbeiten können.

Beispiel:
- 08:00 Objekt A
- 09:15 Objekt B
- 10:30 Objekt C
- 12:00 Objekt D

Optimierung der Route.

Karte mit: Start, Ziel, Zwischenstopps, aktuelle Position, erledigte Objekte, offene Objekte

---

## 17. GPS UND STANDORT

Optionales GPS-Modul.
Mitarbeiter können ihren Standort während eines Einsatzes erfassen.

Funktionen: aktuelle Position, letzte Position, Objektposition, Route, Geofence, Ankunft, Abfahrt

Datenschutz berücksichtigen. GPS nur entsprechend den aktivierten Einstellungen und Berechtigungen verwenden.

---

## 18. SCHLÜSSELVERWALTUNG

Verwalte: Schlüssel, Schlüsselnummer, Objekt, Gebäude, Wohnung, Schließanlage, Mitarbeiter, Ausgabe, Rückgabe, Datum, Uhrzeit, Status, Bemerkung

Mögliche Status: im Schlüsselkasten, ausgegeben, zurückgegeben, verloren, gesperrt

Optional QR-Code für Schlüssel.

---

## 19. ZÄHLERSTÄNDE

Verwaltung von: Strom, Wasser, Gas, Wärme, Heizung, sonstigen Zählern

Daten: Zählernummer, Standort, Einheit, Zählerart, letzter Stand, aktueller Stand, Ablesedatum, Mitarbeiter, Foto

Historie und Verbrauchsentwicklung.

---

## 20. MATERIAL- UND LAGERVERWALTUNG

Materialverwaltung mit: Artikel, Artikelnummer, Kategorie, Lagerort, Bestand, Mindestbestand, Einheit, Einkaufspreis, Lieferant

Materialentnahme einem Auftrag zuordnen.

Automatische Warnung: "Materialbestand niedrig."

---

## 21. FAHRZEUGVERWALTUNG

Verwaltung von: Fahrzeug, Kennzeichen, Fahrzeugtyp, Kilometerstand, TÜV, Inspektion, Versicherung, Reifen, Schäden, Tankvorgänge, Fahrer, Fahrtenbuch

Erinnerungen: TÜV, Inspektion, Reifenwechsel, Versicherung, Wartung

---

## 22. DOKUMENTENVERWALTUNG

Dokumente müssen Objekten, Wohnungen, Aufträgen oder Mitarbeitern zugeordnet werden können.

Beispielsweise: Verträge, Wartungsprotokolle, Prüfberichte, Rechnungen, Angebote, Arbeitsberichte, Bedienungsanleitungen, Grundrisse, Fotos, Protokolle, Versicherungsunterlagen, technische Dokumentation

Kategorien und Suchfunktion. Versionierung berücksichtigen.

---

## 23. FOTO- UND MEDIENVERWALTUNG

Fotos direkt aus der mobilen Anwendung aufnehmen.

Funktionen: vorher/nachher, Objektfoto, Schadensfoto, Arbeitsfoto, Dokumentationsfoto

Fotos sollen automatisch mit Auftrag, Mitarbeiter, Objekt, Datum, Uhrzeit verknüpft werden.

---

## 24. BEWOHNERPORTAL

Bewohner erhalten ein eigenes Portal.

Funktionen: aktuelle Meldungen, geplante Arbeiten, Wartungen, Störungen, Mängel melden, Status verfolgen, Nachrichten, Dokumente, Termine, Ansprechpartner

---

## 25. EIGENTÜMERPORTAL

Eigentümer sollen ihre Objekte überwachen können.

Dashboard: Objektstatus, offene Aufgaben, Mängel, Wartungen, Kosten, Rechnungen, Dokumente, Arbeitsberichte, Fotos, Statistiken

Eigentümer sollen Berichte als PDF herunterladen können.

---

## 26. KOMMUNIKATION

Integriere ein Kommunikationssystem.

Möglichkeiten:
- interne Nachrichten
- Mitarbeiter ↔ Disponent
- Hausmeister ↔ Verwaltung
- Bewohner → Hausmeisterservice
- Eigentümer → Verwaltung/Hausmeisterservice

Nachrichten können einem Objekt oder Auftrag zugeordnet werden.

---

## 27. BENACHRICHTIGUNGEN

Zentrale Notification Engine.

Kanäle: In-App, Push, E-Mail, optional SMS

Automatische Benachrichtigungen bei:
- neuer Mängelmeldung
- neuer Auftrag
- Auftrag zugewiesen
- Auftrag überfällig
- Wartung fällig
- Wartung bald fällig
- Terminänderung
- Arbeiten angekündigt
- neue Nachricht
- Dokument hochgeladen
- Schlüssel überfällig
- Fahrzeugwartung
- Materialbestand niedrig

Benutzer können selbst konfigurieren, welche Benachrichtigungen sie erhalten.

---

## 28. ABRECHNUNG

Integriere ein Abrechnungsmodul.

Erfassung: Arbeitszeit, Material, Fahrtkosten, Fremdleistungen, Pauschalen, Zusatzleistungen

Aufträge können Kosten erzeugen.

Kostenübersicht pro: Auftrag, Objekt, Gebäude, Eigentümer, Zeitraum

Rechnungserstellung vorbereiten. PDF-Rechnungen. Rechnungsnummern.

Status: Entwurf, geprüft, freigegeben, versendet, bezahlt, überfällig

---

## 29. ANALYSEN UND REPORTING

Erstelle ein umfangreiches Reporting.

Beispielsweise:
- Aufträge pro Monat
- erledigte Aufträge
- offene Aufträge
- überfällige Aufträge
- durchschnittliche Bearbeitungszeit
- Arbeitsstunden
- Kosten pro Objekt
- Materialverbrauch
- Wartungen
- Mängel
- häufigste Störungen
- Mitarbeiterleistung
- Fahrzeugkosten
- Auftragseingänge
- Bewohnermeldungen

Diagramme und Filter.

Export: PDF, Excel, CSV

---

## 30. KALENDER

Zentraler Kalender.

Darstellung: Tag, Woche, Monat

Kalenderereignisse: Aufträge, Wartungen, Objektkontrollen, Termine, Mitarbeiterplanung, Abwesenheiten, Arbeiten, Sperrungen

---

## 31. SUCHFUNKTION

Globale Suche.

Suche über: Objekte, Gebäude, Wohnungen, Bewohner, Eigentümer, Mitarbeiter, Aufträge, Wartungen, Dokumente, Schlüssel, Fahrzeuge, Materialien

Intelligente Filter.

---

## 32. AUDIT-LOG

Alle wichtigen Änderungen müssen protokolliert werden.

Beispielsweise:
- "Max Mustermann hat Auftrag #123 geändert."
- "Administrator hat Benutzer angelegt."
- "Auftrag wurde von Mitarbeiter A auf Mitarbeiter B übertragen."
- "Dokument wurde gelöscht."

Speichern: Benutzer, Aktion, Datum, Uhrzeit, Datensatz, vorheriger Wert, neuer Wert

---

## 33. DATENSCHUTZ UND SICHERHEIT

Die Anwendung muss von Anfang an sicher entwickelt werden.

Berücksichtige insbesondere:
- sichere Authentifizierung
- Passwort-Hashing
- Sessions
- Rollen und Rechte
- Mandantentrennung
- Zugriffskontrollen
- sichere Dateiablage
- Schutz vor SQL Injection
- XSS-Schutz
- CSRF-Schutz
- Rate Limiting
- sichere API
- Audit Logging
- Backup-Konzept

Datenschutz nach DSGVO berücksichtigen.

Insbesondere bei: GPS, Bewohnerdaten, Mitarbeiterdaten, Fotos, Dokumenten, Kommunikationsdaten

---

## 34. MOBILE FIRST

Die Anwendung muss auf Smartphones hervorragend funktionieren.

Für Mitarbeiter besonders wichtig:
- große Buttons
- schnelle Navigation
- möglichst wenige Eingaben
- Kamera direkt öffnen
- Arbeitszeit schnell starten/stoppen
- Auftrag mit wenigen Klicks abschließen
- Offline-Funktionalität berücksichtigen
- Synchronisation nach Wiederherstellung der Verbindung

---

## 35. OFFLINE-FÄHIGKEIT

Da Hausmeister häufig in Kellern, Tiefgaragen oder Gebäuden ohne Internet arbeiten:
Die mobile App soll möglichst viele Funktionen offline ermöglichen.

Offline:
- Aufträge anzeigen
- Checklisten ausfüllen
- Fotos aufnehmen
- Arbeitszeiten erfassen
- Arbeitsberichte erstellen
- Notizen erstellen

Nach Wiederherstellung der Verbindung:
- automatische Synchronisierung
- Konfliktbehandlung
- Synchronisationsstatus anzeigen

---

## 36. DESIGN

Das Design soll modern, hochwertig und professionell wirken. Kein veraltetes ERP-Design.

Orientierung:
- moderne SaaS-Anwendungen
- klare Navigation
- übersichtliche Dashboards
- Karten
- Tabellen
- Kalender
- moderne Formulare
- Status-Badges
- Kartenansichten
- responsive Layouts

Desktop: Sidebar + Hauptbereich.
Mobile: Bottom Navigation bzw. mobile Navigation.

---

## 37. DARK MODE

Implementiere einen vollständigen Dark Mode.

Der Dark Mode muss für alle Bereiche funktionieren:
- Dashboard
- Tabellen
- Formulare
- Karten
- Kalender
- Modale
- Diagramme
- mobile Ansicht
- PDF-Vorschauen

Keine schlecht lesbaren Kontraste.

---

## 38. ADMIN-EINSTELLUNGEN

Der Administrator soll umfangreiche Einstellungen erhalten.

**Unternehmen:** Name, Logo, Adresse, Kontaktdaten, Rechnungsdaten
**System:** Zeitzone, Sprache, Datumsformat, Währung
**Module:** Module aktivieren/deaktivieren
**Benutzer:** Rollen, Rechte, Benutzergruppen
**Benachrichtigungen:** E-Mail, Push, SMS, Vorlagen
**Dokumente:** Vorlagen, Nummerierung
**Aufträge:** Kategorien, Prioritäten, Status
**Objekte:** Objektarten
**Material:** Kategorien
**Fahrzeuge:** Fahrzeugtypen

---

## 39. AUTOMATISIERUNGEN

Baue eine Automatisierungsengine ein.

Beispiele:
- Wenn Wartung in 30 Tagen fällig → Administrator informieren
- Wenn Wartung in 7 Tagen fällig → Mitarbeiter informieren
- Wenn Bewohner Mangel meldet → zuständigen Mitarbeiter benachrichtigen
- Wenn Auftrag überfällig → Objektleiter benachrichtigen
- Wenn Material unter Mindestbestand → Lagerverantwortlichen informieren
- Wenn Fahrzeug-TÜV bald abläuft → Administrator informieren
- Wenn Schlüssel nicht zurückgegeben → Erinnerung senden

---

## 40. QR-CODES

Optional QR-Codes für: Objekte, Gebäude, Räume, technische Anlagen, Fahrzeuge, Schlüssel, Materialien

Beispiel: Hausmeister scannt QR-Code an einer Heizungsanlage.
Die App öffnet automatisch "Heizungsanlage Haus A" mit: Wartungshistorie, Dokumenten, letzten Prüfungen, offenen Aufgaben, Checklisten, Fotos, technischen Informationen.

---

## 41. NOTFALLFUNKTION

Baue einen Bereich für dringende Ereignisse.

Beispiele:
- Wasserrohrbruch
- Heizungsausfall
- Stromausfall
- Aufzugsausfall
- Brand-/Rauchmeldung
- starke Beschädigung
- Überschwemmung
- Einbruchsschaden
- Sturmschaden
- Gefahr auf Verkehrsflächen

Notfallauftrag: höchste Priorität, sofortige Benachrichtigung, Mitarbeiterzuweisung, Standort, Fotos, Dokumentation, Zeitstempel, Statusverfolgung

---

## 42. WICHTIGE AUTOMATISCHE AUFGABEN

Das System soll automatisch wiederkehrende Aufgaben erzeugen können.

Beispiele:
- Jeden Montag: "Treppenhaus Objekt A kontrollieren."
- Jeden Monat: "Rauchmelder prüfen."
- Jedes Jahr: "Dachkontrolle durchführen."
- Vor Winterbeginn: "Winterdienst vorbereiten."
- Im Frühjahr: "Außenanlagen kontrollieren."

---

## 43. DATENMODELL

Entwickle eine saubere relationale Datenstruktur.

Mindestens berücksichtigen:
Tenant, User, Role, Permission, Property, Building, Unit, Resident, Owner, Employee, WorkOrder, Task, Maintenance, Checklist, ChecklistItem, WorkReport, TimeEntry, Schedule, Shift, Route, Location, GPSLog, Key, Meter, Material, Inventory, Vehicle, VehicleMaintenance, Document, Photo, Message, Notification, Invoice, Cost, Announcement, AuditLog

Beziehungen sauber definieren.

---

## 44. API

Baue eine saubere API-Architektur.
Alle wichtigen Funktionen müssen über eine strukturierte API erreichbar sein.

Berücksichtige: Authentifizierung, Autorisierung, Pagination, Filter, Sortierung, Suche, Validierung, Fehlerbehandlung, Logging

---

## 45. FEHLERBEHANDLUNG

Keine technischen Fehlermeldungen für Endbenutzer.
Stattdessen verständliche Hinweise.

Beispiel:
- Nicht: "500 Internal Server Error"
- Sondern: "Der Auftrag konnte momentan nicht gespeichert werden. Bitte versuchen Sie es erneut."

Technische Fehler müssen trotzdem serverseitig protokolliert werden.

---

## 46. BENUTZERFREUNDLICHKEIT

Die App muss so konzipiert sein, dass auch technisch wenig erfahrene Hausmeister sie sofort bedienen können.

Möglichst:
- wenige Klicks
- große Touch-Flächen
- verständliche Begriffe
- klare Statusfarben
- einfache Formulare
- automatische Vorschläge
- vorausgefüllte Daten
- Kamera direkt integrieren
- schnelle Aktionen

---

## 47. ENTWICKLUNGSSTRATEGIE

Arbeite NICHT einfach blind alle Funktionen auf einmal ab. Gehe strukturiert vor.

### Phase 1
Analysiere zuerst das vorhandene Projekt.
Prüfe: Framework, Programmiersprache, Datenbank, vorhandene Komponenten, bestehende Architektur, Authentifizierung, API, Designsystem, Buildsystem.

Falls bereits Code vorhanden ist: Nichts unnötig zerstören oder neu schreiben. Bestehende funktionierende Komponenten wiederverwenden.

### Phase 2
Erstelle eine technische Architektur.
Definiere: Datenmodell, API, Module, Komponenten, Berechtigungen, Navigation, Datenflüsse, Sicherheitskonzept.

### Phase 3
Implementiere zuerst: Login, Benutzer, Rollen, Rechte, Mandanten, Dashboard, Objekte, Mitarbeiter, Aufträge.

### Phase 4
Danach: Bewohner, Eigentümer, Meldungen, Wartungen, Checklisten, Arbeitsberichte, Fotos, Dokumente.

### Phase 5
Danach: Zeiterfassung, Mitarbeiterplanung, Schichtplanung, Touren, GPS, Karten.

### Phase 6
Danach: Schlüssel, Zähler, Material, Fahrzeuge, Lager.

### Phase 7
Danach: Kommunikation, Benachrichtigungen, Eigentümerportal, Bewohnerportal, Abrechnung.

### Phase 8
Danach: Reporting, Automatisierungen, QR-Codes, Offline-Funktion, Audit-Log, Feinschliff.

---

## 48. TESTS

Schreibe Tests für kritische Funktionen.

Insbesondere: Login, Berechtigungen, Mandantentrennung, Aufträge, Zeiterfassung, Wartungen, Benachrichtigungen, Abrechnung, Datenvalidierung, API, Offline-Synchronisierung

Teste auch: Mobile, Tablet, Desktop, Dark Mode, verschiedene Rollen

---

## 49. DEMODATEN

Erstelle realistische Demo-Daten.

Beispielsweise: Hausmeisterservice "Muster Objektservice GmbH" mit mehreren Mitarbeitern, Objekten, Gebäuden, Wohnungen, Bewohnern, Eigentümern, Aufträgen, Wartungen, Fahrzeugen, Materialien, Dokumenten, Meldungen.

Dadurch soll die Anwendung direkt realistisch getestet werden können.

---

## 50. BESONDERS WICHTIG: PROFESSIONELLE PRODUKTQUALITÄT

Die Anwendung darf nicht wie ein Prototyp wirken.

Keine: Platzhalter, leeren Seiten, Dummy-Buttons, "Coming Soon"-Bereiche, nicht funktionierenden Menüs, Fake-Daten ohne Funktion, unvollständigen Formulare

Wenn eine Funktion in der Oberfläche vorhanden ist, muss sie grundsätzlich funktionieren.

---

## 51. UX: SCHNELLAKTIONEN

Implementiere Quick Actions.

Beispielsweise:
- "+ Auftrag"
- "+ Mangel melden"
- "+ Wartung"
- "+ Bewohner"
- "+ Objekt"
- "+ Arbeitsbericht"
- "+ Foto"
- "Arbeitszeit starten"
- "Arbeitszeit stoppen"
- "Notfall melden"
- "Zählerstand erfassen"
- "Schlüssel ausgeben"
- "Material entnehmen"

---

## 52. SUCH- UND FILTERSYSTEM

Alle größeren Listen benötigen: Suche, Filter, Sortierung, Pagination, Statusfilter, Datumsfilter, Objektfilter, Mitarbeiterfilter, Prioritätsfilter

Filter sollen gespeichert werden können.

---

## 53. RESPONSIVE NAVIGATION

**Desktop-Sidebar:**
Dashboard, Aufträge, Objekte, Bewohner, Eigentümer, Mitarbeiter, Planung, Kalender, Wartungen, Mängel, Checklisten, Arbeitsberichte, Zeiterfassung, Touren, Karte, Schlüssel, Zähler, Material, Fahrzeuge, Dokumente, Kommunikation, Benachrichtigungen, Abrechnung, Reporting, Einstellungen

Mobile Navigation entsprechend vereinfachen.

---

## 54. STARTSEITE FÜR BEWOHNER

Die Bewohnerseite soll besonders einfach sein.

Beispielsweise:

**Aktuelle Informationen**
"Heute findet zwischen 08:00 und 12:00 Uhr eine Wartung der Heizungsanlage statt."

**Schnell melden**
[ Mangel melden ]

**Meine Meldungen**
"Defekte Kellerbeleuchtung"
Status: In Bearbeitung

**Anstehende Arbeiten**
"Treppenhausreinigung"
Freitag, 07.08.

---

## 55. STARTSEITE FÜR MITARBEITER

Beispielsweise:

**"Guten Morgen!"**

Heute:
- 08:00 Objekt A – Kontrollgang
- 09:30 Objekt B – Reparatur
- 11:00 Objekt C – Wartung

Buttons:
- [ Arbeitszeit starten ]
- [ Meine Aufgaben ]
- [ Tour ]
- [ Auftrag melden ]
- [ Foto aufnehmen ]

---

## 56. STARTSEITE FÜR ADMINISTRATOREN

**Dashboard mit KPIs:**
- Offene Aufträge: 23
- Überfällig: 4
- Heute geplant: 18
- Wartungen fällig: 6
- Neue Meldungen: 8
- Mitarbeiter im Einsatz: 7
- Materialwarnungen: 3
- Fahrzeugwartungen: 2

---

## 57. BENUTZERERLEBNIS

Die Anwendung soll sich wie ein modernes professionelles SaaS-Produkt anfühlen.

Priorität:
1. Einfachheit
2. Geschwindigkeit
3. Übersichtlichkeit
4. mobile Nutzung
5. Sicherheit
6. Erweiterbarkeit
7. professionelle Optik

---

## 58. TECHNISCHE ENTSCHEIDUNGEN

Bevor du Code schreibst: Analysiere das vorhandene Projekt und wähle die Technologien, die am besten zur bestehenden Codebasis passen.

Wenn das Projekt bereits einen Tech-Stack besitzt, bleibe möglichst bei diesem Stack. Keine unnötige Migration.

Verwende:
- saubere Komponentenarchitektur
- Type Safety, sofern verfügbar
- wiederverwendbare UI-Komponenten
- saubere Services
- Validierung
- Datenbankmigrationen
- Environment Variables
- Logging
- Fehlerbehandlung

---

## 59. DOKUMENTATION

Erstelle eine technische Dokumentation.

Dokumentiere: Architektur, Datenbank, API, Rollen/Rechte, Installation, Environment Variables, Deployment, Backup, Wartung, Erweiterung um neue Module

Zusätzlich eine kurze Benutzerhilfe.

---

## 60. DEIN ARBEITSAUFTRAG

Beginne NICHT sofort damit, tausende Zeilen Code zu schreiben.

Zuerst:
1. Projekt analysieren
2. vorhandene Architektur verstehen
3. vorhandene Funktionen erkennen
4. Datenmodell planen
5. Modulstruktur planen
6. Berechtigungssystem planen
7. UI/UX planen
8. Entwicklungsphasen festlegen

Danach beginne mit der Implementierung. Arbeite Schritt für Schritt.

Nach jeder größeren Phase:
- Code prüfen
- Fehler beheben
- Tests ausführen
- Build ausführen
- Datenbankmigrationen prüfen
- responsive Darstellung prüfen
- Berechtigungen testen

---

## 61. WICHTIGE REGEL

Wenn du während der Entwicklung erkennst, dass eine Funktion technisch anders oder besser umgesetzt werden sollte, entscheide dich für die professionellere Lösung.

Priorisiere:
- Sicherheit
- Datenschutz
- Skalierbarkeit
- Wartbarkeit
- Benutzerfreundlichkeit
- Performance

Vermeide unnötige Komplexität.

---

## 62. ZIEL

Am Ende soll eine vollständige, professionelle Hausmeisterservice-Plattform entstehen, mit der ein echtes Hausmeisterunternehmen seinen kompletten täglichen Betrieb digital organisieren kann.

Die Software soll folgende Benutzergruppen bedienen:
- Administratoren
- Hausmeister
- technische Mitarbeiter
- Reinigungskräfte
- Objektleiter
- Disponenten
- Fahrer
- Buchhaltung
- Eigentümer
- Hausverwaltungen
- Bewohner
- externe Dienstleister

Alle Rollen müssen über ein flexibles und individuell konfigurierbares Rollen- und Berechtigungssystem steuerbar sein.

Die Plattform soll als Grundlage für ein späteres kommerzielles SaaS-Produkt geeignet sein.

---

## ABSCHLIESSENDE ANWEISUNG

Arbeite jetzt wie ein Senior-Entwicklungsteam.

1. Analysiere zuerst das bestehende Projekt.
2. Erstelle anschließend einen konkreten Implementierungsplan.
3. Danach beginne mit der Umsetzung.

Implementiere Funktionen vollständig und nicht nur als UI-Mockup.
Achte bei jeder Funktion darauf, dass sie mit den anderen Modulen verbunden ist.

**Beispiel-Datenfluss:**

Ein Bewohner meldet einen Mangel.
→ Mangel wird gespeichert
→ Objekt wird automatisch erkannt
→ zuständige Mitarbeiter werden ermittelt
→ Auftrag wird erzeugt
→ Mitarbeiter erhält Benachrichtigung
→ Mitarbeiter fährt zum Objekt
→ GPS/Ankunft kann erfasst werden
→ Arbeitszeit wird erfasst
→ Checkliste wird ausgeführt
→ Fotos werden aufgenommen
→ Material wird verbucht
→ Arbeitsbericht wird erstellt
→ Auftrag wird abgeschlossen
→ Bewohner wird informiert
→ Eigentümer kann den Vorgang sehen
→ Kosten werden dem Objekt zugeordnet
→ Vorgang erscheint im Reporting.
