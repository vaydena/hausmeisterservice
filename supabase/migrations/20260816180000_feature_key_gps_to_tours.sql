-- Sprint 140: Tarif-Feature `gps` heisst jetzt `tours`.
--
-- Der Schluessel hiess `gps` und schaltete Tourenplanung frei. Gebaut war nur
-- die Tourenplanung: `time_entries` hat in keiner Migration eine
-- Koordinatenspalte, `maplibre-gl` wurde nie importiert, /map nie angelegt.
-- Verkauft wurde trotzdem "GPS-Tracking & Touren" — Business ab 149 EUR/Monat,
-- flankiert von einem Absatz in /datenschutz ueber 90 Tage Speicherdauer fuer
-- Daten, die nie entstanden sind.
--
-- Warum umbenennen statt nur das Label aendern: der Schluessel steht in dieser
-- Tabelle und wird von getEnabledFeatures() gelesen. Ein Schluessel `gps`, der
-- Tourenplanung bedeutet, laedt den naechsten Sprint dazu ein, aus
-- `features.gps === true` zu schliessen, GPS sei zugesagt.
--
-- Gemessen vor der Ausfuehrung (16.08.2026): 3 Mandanten, davon 0 mit
-- subscription_plan_id und 0 ausserhalb von `trial`. getEnabledFeatures gibt
-- diesen dreien ueber allFeatures() ohnehin alles frei — die Umschluesselung
-- aendert fuer keinen Bestandsmandanten etwas, auch nicht im Zeitfenster
-- zwischen Migration und Deploy.

update platform.subscription_plans
set features = (features - 'gps')
             || jsonb_build_object('tours', coalesce(features -> 'gps', 'false'::jsonb))
where features ? 'gps';

-- Die Beschreibung des Business-Plans steht auf /preise unter dem Preis.
update platform.subscription_plans
set description = 'Für wachsende Agenturen mit Tourenplanung, Bewohnerportal und Fuhrpark.'
where code = 'business';

comment on column platform.subscription_plans.features is
  'Feature-Flags als jsonb, z.B. {"tours":true,"portal":true,"vehicles":true,"automations":true,"api":true}. Wird vom Feature-Gate assertFeature() gelesen. Die Schluessel sind FEATURE_KEYS aus src/lib/tenant/feature-map.ts — beide Enden muessen zusammen geaendert werden.';

-- Das Modul `gps` ist aus der Registry entfernt (kein menuPath seit Sprint 139,
-- keine Seite seit jeher). Genau ein Mandant hatte eine aktive Zeile darauf:
-- ein Bestand aus der Zeit vor dem Signup-Riegel aus Sprint 123. Ohne diese
-- Zeile bliebe ein Schalter in der Datenbank, den kein Code mehr kennt.
delete from public.tenant_modules where module_key = 'gps';

-- 2 Permissions, 33 Zuweisungen ueber 27 von 45 Rollen — und keine davon hat je
-- etwas freigeschaltet, weil es keine Position zu sehen gab. role_permissions
-- haengt per FK an permissions.key; die Zuweisungen werden zuerst geloescht,
-- damit die Reihenfolge nicht von der Cascade-Definition abhaengt.
delete from public.role_permissions where permission_key like 'gps.%';
delete from public.permissions where module_key = 'gps';
