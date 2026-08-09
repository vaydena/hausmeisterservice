/**
 * Demo-Daten-Seed — aktiviert die wichtigsten Domain-Module und legt beispielhafte
 * Objekte, Mitarbeiter und Aufträge im bestehenden Demo-Tenant an.
 *
 * Voraussetzungen:
 *  - Permissions-Seed lief:  pnpm tsx supabase/seed/permissions.ts
 *  - Onboarding-Seed lief:   pnpm tsx supabase/seed/onboarding.ts
 *  - .env.local mit SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:  pnpm tsx supabase/seed/demo-data.ts
 *
 * Idempotent: mehrfach ausführbar; nichts wird überschrieben.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || serviceKey.startsWith('PASTE_')) {
  console.error('SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_URL fehlen in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_SLUG = 'hausmeisterservice';

const DEMO_MODULES = [
  'properties',
  'employees',
  'work_orders',
  'defect_reports',
  'residents',
  'owners',
  'maintenance',
  'checklists',
  'documents',
  'photos',
  'time_tracking',
  'scheduling',
  'tours',
  'keys',
  'meters',
  'materials',
  'vehicles',
  'messaging',
  'announcements',
  'billing',
] as const;

type DemoEmployee = {
  email: string;
  displayName: string;
  roleKey: 'disponent' | 'hausmeister';
  phone?: string;
  skills?: string[];
};

const DEMO_EMPLOYEES: DemoEmployee[] = [
  {
    email: 'disponent+demo@vaydena.local',
    displayName: 'Sabine Berger',
    roleKey: 'disponent',
    phone: '+49 228 555 0110',
  },
  {
    email: 'hausmeister+demo@vaydena.local',
    displayName: 'Thomas Krüger',
    roleKey: 'hausmeister',
    phone: '+49 228 555 0120',
    skills: ['Sanitär', 'Heizung', 'Elektro (Grundlagen)'],
  },
];

type BuildingSpec = {
  name: string;
  floors?: number;
  units: Array<{ code: string; floor?: number; rooms?: number; sqm?: number; type?: string }>;
};

type PropertySpec = {
  name: string;
  propertyType: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  gpsLat?: number;
  gpsLng?: number;
  accessNotes?: string;
  emergencyNotes?: string;
  buildings: BuildingSpec[];
};

const DEMO_PROPERTIES: PropertySpec[] = [
  {
    name: 'Wohnpark Rheinaue',
    propertyType: 'Mehrfamilienhaus',
    street: 'Rheinauer Weg',
    houseNumber: '14–18',
    postalCode: '53175',
    city: 'Bonn',
    gpsLat: 50.703,
    gpsLng: 7.13,
    accessNotes: 'Hauptzugang Rheinauer Weg 14, Nebeneingang am Innenhof.',
    emergencyNotes: 'Heizungshauptschalter im Kellerraum K-01.',
    buildings: [
      {
        name: 'Haus A',
        floors: 4,
        units: [
          { code: '1.1', floor: 1, rooms: 2, sqm: 62, type: 'Wohnung' },
          { code: '1.2', floor: 1, rooms: 3, sqm: 78, type: 'Wohnung' },
          { code: '2.1', floor: 2, rooms: 2, sqm: 64, type: 'Wohnung' },
          { code: '3.1', floor: 3, rooms: 4, sqm: 108, type: 'Wohnung' },
        ],
      },
      {
        name: 'Haus B',
        floors: 4,
        units: [
          { code: '1.1', floor: 1, rooms: 2, sqm: 60, type: 'Wohnung' },
          { code: '2.1', floor: 2, rooms: 3, sqm: 82, type: 'Wohnung' },
        ],
      },
    ],
  },
  {
    name: 'Bürocenter Königsallee 42',
    propertyType: 'Gewerbeobjekt',
    street: 'Königsallee',
    houseNumber: '42',
    postalCode: '40212',
    city: 'Düsseldorf',
    gpsLat: 51.223,
    gpsLng: 6.783,
    accessNotes: 'Schlüsselkasten Rückseite, Code beim Objektleiter.',
    emergencyNotes: 'Rauchmeldezentrale im EG links neben Aufzug.',
    buildings: [
      {
        name: 'Turm West',
        floors: 8,
        units: [
          { code: 'EG-01', floor: 0, sqm: 240, type: 'Ladenlokal' },
          { code: '2-01', floor: 2, sqm: 320, type: 'Büroetage' },
          { code: '5-01', floor: 5, sqm: 320, type: 'Büroetage' },
        ],
      },
    ],
  },
  {
    name: 'Villa am See',
    propertyType: 'Einfamilienhaus',
    street: 'Seepromenade',
    houseNumber: '7',
    postalCode: '50968',
    city: 'Köln',
    gpsLat: 50.892,
    gpsLng: 6.977,
    accessNotes: 'Torcode 2416, Alarmanlage über App.',
    buildings: [
      {
        name: 'Haupthaus',
        floors: 2,
        units: [{ code: 'EG', floor: 0, rooms: 5, sqm: 190, type: 'Wohnhaus' }],
      },
    ],
  },
];

async function main() {
  console.log('1/22  Tenant + Owner finden ...');
  const { tenantId, ownerUserId } = await findTenantAndOwner();
  console.log(`    tenant_id = ${tenantId}`);
  console.log(`    owner_id  = ${ownerUserId}`);

  console.log('2/22  Domain-Module aktivieren ...');
  await enableDemoModules(tenantId);

  console.log('2b/22 Rechnungs-Absenderprofil setzen ...');
  await seedTenantBillingProfile(tenantId);

  console.log('3/22  Demo-Mitarbeiter-Users sicherstellen ...');
  const employeeUserIds = await ensureDemoUsers(tenantId);

  console.log('4/22  Employees + Rollen zuweisen ...');
  const employeesByRole = await ensureEmployees(tenantId, employeeUserIds, ownerUserId);

  console.log('5/22  Properties + Buildings + Units anlegen ...');
  const propertyIdByName = await ensureProperties(tenantId, ownerUserId);

  console.log('6/22  Work Orders anlegen ...');
  await ensureWorkOrders(tenantId, ownerUserId, propertyIdByName, employeesByRole);

  console.log('7/22  Mängelmeldungen anlegen ...');
  await ensureDefectReports(tenantId, ownerUserId, propertyIdByName);

  console.log('8/22  Bewohner anlegen ...');
  await ensureResidents(tenantId, ownerUserId, propertyIdByName);

  console.log('9/22  Eigentümer + Property-Zuordnungen anlegen ...');
  await ensureOwners(tenantId, ownerUserId, propertyIdByName);

  console.log('10/22 Wartungspläne anlegen ...');
  await ensureMaintenancePlans(tenantId, ownerUserId, propertyIdByName);

  console.log('11/22 Checklisten-Vorlagen anlegen ...');
  await ensureChecklistTemplates(tenantId, ownerUserId);

  console.log('12/22 Zeit-Einträge anlegen ...');
  const seededTimeEntries = await ensureTimeEntries(
    tenantId,
    employeesByRole,
    ownerUserId,
    propertyIdByName,
  );

  console.log('13/22 Kalender-Termine anlegen ...');
  await ensureScheduleEntries(tenantId, employeesByRole, ownerUserId);

  console.log('14/22 Korrekturanträge anlegen ...');
  await ensureTimeCorrections(tenantId, employeesByRole, ownerUserId, seededTimeEntries);

  console.log('15/22 Schlüssel + Handovers anlegen ...');
  await ensureKeys(tenantId, ownerUserId, propertyIdByName, employeesByRole);

  console.log('16/22 Zähler + Ablesungen anlegen ...');
  await ensureMeters(tenantId, ownerUserId, propertyIdByName);

  console.log('17/22 Material + Bewegungen anlegen ...');
  await ensureMaterials(tenantId, ownerUserId, propertyIdByName, employeesByRole);

  console.log('18/22 Fahrzeuge + Ereignisse anlegen ...');
  await ensureVehicles(tenantId, ownerUserId, employeesByRole);

  console.log('19/22 Touren + Stopps anlegen ...');
  await ensureTours(tenantId, ownerUserId, propertyIdByName, employeesByRole);

  console.log('20/22 Nachrichten-Threads anlegen ...');
  await ensureMessageThreads(tenantId, ownerUserId, employeesByRole);

  console.log('21/22 Ankündigungen anlegen ...');
  await ensureAnnouncements(tenantId, ownerUserId, employeesByRole);

  console.log('22/22 Abrechnung (Angebote + Rechnungen) anlegen ...');
  await ensureBillingDocuments(tenantId, ownerUserId, propertyIdByName);

  console.log('22b/22 Automatisierungs-Regeln anlegen ...');
  await ensureAutomationRules(tenantId, ownerUserId);

  console.log('\nFertig. Nach Login siehst du im Demo-Tenant:');
  console.log(`  • ${DEMO_PROPERTIES.length} Objekte inkl. Buildings/Units`);
  console.log(`  • ${DEMO_EMPLOYEES.length + 1} Mitarbeiter (inkl. Owner)`);
  console.log(`  • 6 Aufträge in verschiedenen Status`);
  console.log(`  • ${DEMO_DEFECT_REPORTS.length} Mängelmeldungen (offen / in Prüfung / abgelehnt)`);
  console.log(`  • ${DEMO_RESIDENTS.length} Bewohner`);
  console.log(`  • ${DEMO_OWNERS.length} Eigentümer inkl. Property-Zuordnungen`);
  console.log(`  • ${DEMO_MAINTENANCE_PLANS.length} Wartungspläne`);
  console.log(`  • ${DEMO_CHECKLIST_TEMPLATES.length} Checklisten-Vorlagen`);
  console.log(`  • Zeit-Einträge für die letzten 10 Werktage (Hausmeister + Disponent)`);
  console.log(`  • ${DEMO_SCHEDULE_ENTRIES.length} Kalender-Termine für kommende Werktage`);
  console.log(`  • 3 Korrekturanträge (offen / genehmigt / abgelehnt)`);
  console.log(`  • ${DEMO_KEYS.length} Schlüssel mit Ausgabe-/Rückgabe-Historie`);
  console.log(`  • ${DEMO_METERS.length} Zähler mit Ablesungshistorie`);
  console.log(`  • ${DEMO_MATERIALS.length} Materialien inkl. Wareneingänge/Entnahmen`);
  console.log(`  • ${DEMO_VEHICLES.length} Fahrzeuge inkl. TÜV/Service/Tank-Historie`);
  console.log(`  • ${DEMO_TOURS.length} Touren mit Multi-Stopp-Planung`);
  console.log(`  • ${DEMO_MESSAGE_THREADS.length} Nachrichten-Threads mit Verlauf`);
  console.log(`  • ${DEMO_ANNOUNCEMENTS.length} Ankündigungen (Team-Broadcast + rollenspezifisch)`);
  console.log(`  • ${DEMO_BILLING_OFFERS.length} Angebote + ${DEMO_BILLING_INVOICES.length} Rechnungen (Entwurf/verschickt/bezahlt/überfällig)`);
}

async function findTenantAndOwner(): Promise<{ tenantId: string; ownerUserId: string }> {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', TENANT_SLUG)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" nicht gefunden — bitte zuerst onboarding.ts laufen lassen.`);

  const { data: owner, error: ownerError } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('tenant_id', tenant.id)
    .eq('is_owner', true)
    .limit(1)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner) throw new Error('Kein Owner-Membership im Tenant — bitte onboarding.ts laufen lassen.');

  return { tenantId: tenant.id, ownerUserId: owner.user_id };
}

async function enableDemoModules(tenantId: string) {
  const rows = DEMO_MODULES.map((module_key) => ({
    tenant_id: tenantId,
    module_key,
    enabled: true,
  }));
  const { error } = await supabase
    .from('tenant_modules')
    .upsert(rows, { onConflict: 'tenant_id,module_key' });
  if (error) throw error;
}

async function seedTenantBillingProfile(tenantId: string) {
  const { error } = await supabase
    .from('tenants')
    .update({
      address: {
        street: 'Musterweg 1',
        zip: '10115',
        city: 'Berlin',
        country: 'Deutschland',
      },
      invoice_data: {
        legal_name: 'Hausmeisterservice Musterstadt GmbH',
        tax_id: '13/456/78900',
        vat_id: 'DE123456789',
        email: 'buchhaltung@hausmeisterservice-demo.de',
        phone: '+49 30 12345678',
        website: 'https://hausmeisterservice-demo.de',
        bank_name: 'Sparkasse Berlin',
        iban: 'DE12500105170648489890',
        bic: 'INGDDEFFXXX',
        payment_terms_days: 14,
        footer_note:
          'Geschäftsführung: Anna Mustermann · Handelsregister: HRB 12345 · Amtsgericht Berlin',
      },
    })
    .eq('id', tenantId);
  if (error) throw error;
}

async function ensureDemoUsers(
  tenantId: string,
): Promise<Record<string, string>> {
  const listResult = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listResult.error) throw listResult.error;
  const existingByEmail = new Map<string, string>();
  for (const u of listResult.data.users) {
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u.id);
  }

  const userIdByEmail: Record<string, string> = {};
  for (const emp of DEMO_EMPLOYEES) {
    const key = emp.email.toLowerCase();
    let userId = existingByEmail.get(key);
    if (!userId) {
      const created = await supabase.auth.admin.createUser({
        email: emp.email,
        password: crypto.randomUUID() + 'Aa1!',
        email_confirm: true,
        user_metadata: { display_name: emp.displayName },
      });
      if (created.error) throw created.error;
      userId = created.data.user!.id;
    }
    userIdByEmail[emp.email] = userId;

    // display_name in users-Profil sicherstellen
    await supabase
      .from('users')
      .upsert({ id: userId, display_name: emp.displayName }, { onConflict: 'id' });

    // Membership sicherstellen
    const memb = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!memb.data) {
      const { error } = await supabase.from('memberships').insert({
        user_id: userId,
        tenant_id: tenantId,
        status: 'active',
        is_owner: false,
      });
      if (error) throw error;
    }
  }
  return userIdByEmail;
}

type EmployeeInfo = { employeeId: string; userId: string };
type EmployeesByRole = Record<'disponent' | 'hausmeister', EmployeeInfo>;

async function ensureEmployees(
  tenantId: string,
  userIdByEmail: Record<string, string>,
  actorId: string,
): Promise<EmployeesByRole> {
  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id, key')
    .eq('tenant_id', tenantId)
    .in('key', ['disponent', 'hausmeister']);
  if (rolesError) throw rolesError;
  const roleIdByKey = new Map((roles ?? []).map((r) => [r.key, r.id]));

  const employeeByRole: Partial<EmployeesByRole> = {};

  for (const emp of DEMO_EMPLOYEES) {
    const userId = userIdByEmail[emp.email]!;

    const existingEmp = await supabase
      .from('employees')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    let employeeId = existingEmp.data?.id;
    if (!employeeId) {
      const inserted = await supabase
        .from('employees')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          employment_status: 'active',
          hire_date: '2026-01-15',
          phone: emp.phone ?? null,
          skills: emp.skills ?? [],
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error) throw inserted.error;
      employeeId = inserted.data.id;
    }
    employeeByRole[emp.roleKey] = { employeeId, userId };

    const roleId = roleIdByKey.get(emp.roleKey);
    if (!roleId) {
      console.warn(`  ! Rolle "${emp.roleKey}" nicht gefunden — bitte onboarding.ts laufen lassen`);
      continue;
    }
    const existingRole = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('role_id', roleId)
      .is('scope_type', null)
      .maybeSingle();
    if (!existingRole.data) {
      const { error } = await supabase.from('user_roles').insert({
        user_id: userId,
        tenant_id: tenantId,
        role_id: roleId,
        scope_type: null,
        scope_id: null,
      });
      if (error) throw error;
    }
  }

  if (!employeeByRole.disponent || !employeeByRole.hausmeister) {
    throw new Error('Konnte Demo-Employees nicht vollständig anlegen.');
  }
  return employeeByRole as EmployeesByRole;
}

async function ensureProperties(
  tenantId: string,
  actorId: string,
): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();

  for (const spec of DEMO_PROPERTIES) {
    let propertyId: string;
    const existing = await supabase
      .from('properties')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', spec.name)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing.data) {
      propertyId = existing.data.id;
    } else {
      const inserted = await supabase
        .from('properties')
        .insert({
          tenant_id: tenantId,
          name: spec.name,
          property_type: spec.propertyType,
          street: spec.street,
          house_number: spec.houseNumber,
          postal_code: spec.postalCode,
          city: spec.city,
          country: 'DE',
          gps_lat: spec.gpsLat ?? null,
          gps_lng: spec.gpsLng ?? null,
          access_notes: spec.accessNotes ?? null,
          emergency_notes: spec.emergencyNotes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error) throw inserted.error;
      propertyId = inserted.data.id;
    }
    nameToId.set(spec.name, propertyId);

    for (const bld of spec.buildings) {
      let buildingId: string;
      const existingB = await supabase
        .from('buildings')
        .select('id')
        .eq('property_id', propertyId)
        .eq('name', bld.name)
        .maybeSingle();

      if (existingB.data) {
        buildingId = existingB.data.id;
      } else {
        const insertedB = await supabase
          .from('buildings')
          .insert({
            tenant_id: tenantId,
            property_id: propertyId,
            name: bld.name,
            floors: bld.floors ?? null,
            created_by: actorId,
            updated_by: actorId,
          })
          .select('id')
          .single();
        if (insertedB.error) throw insertedB.error;
        buildingId = insertedB.data.id;
      }

      for (const unit of bld.units) {
        const existingU = await supabase
          .from('units')
          .select('id')
          .eq('building_id', buildingId)
          .eq('code', unit.code)
          .maybeSingle();
        if (existingU.data) continue;

        const { error } = await supabase.from('units').insert({
          tenant_id: tenantId,
          property_id: propertyId,
          building_id: buildingId,
          code: unit.code,
          floor: unit.floor ?? null,
          rooms: unit.rooms ?? null,
          size_sqm: unit.sqm ?? null,
          unit_type: unit.type ?? null,
          created_by: actorId,
          updated_by: actorId,
        });
        if (error) throw error;
      }
    }
  }

  return nameToId;
}

type WorkOrderSpec = {
  title: string;
  description?: string;
  propertyName: string;
  category?: string;
  priority: 'low' | 'normal' | 'high' | 'emergency';
  status: 'new' | 'planned' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  isEmergency?: boolean;
  assignRole?: 'disponent' | 'hausmeister';
  estimatedMinutes?: number;
  deadlineDaysFromNow?: number;
};

const DEMO_WORK_ORDERS: WorkOrderSpec[] = [
  {
    title: 'Heizung fällt aus in Whg. 3.1',
    description: 'Mieter meldet kalten Heizkörper trotz voll geöffnetem Ventil.',
    propertyName: 'Wohnpark Rheinaue',
    category: 'Heizung',
    priority: 'high',
    status: 'in_progress',
    assignRole: 'hausmeister',
    estimatedMinutes: 90,
    deadlineDaysFromNow: 1,
  },
  {
    title: 'Aufzug außer Betrieb — Turm West',
    description: 'Aufzug bleibt zwischen 3. und 4. OG stehen. Wartungsfirma ist informiert.',
    propertyName: 'Bürocenter Königsallee 42',
    category: 'Aufzug',
    priority: 'emergency',
    status: 'new',
    isEmergency: true,
    deadlineDaysFromNow: 0,
  },
  {
    title: 'Beleuchtung Tiefgarage flackert',
    description: 'Zwei Deckenleuchten flackern im hinteren Bereich der Tiefgarage.',
    propertyName: 'Wohnpark Rheinaue',
    category: 'Elektro',
    priority: 'normal',
    status: 'planned',
    assignRole: 'hausmeister',
    estimatedMinutes: 45,
    deadlineDaysFromNow: 5,
  },
  {
    title: 'Rasen mähen Innenhof',
    description: 'Innenhof Haus A + B, inkl. Kantenschnitt.',
    propertyName: 'Wohnpark Rheinaue',
    category: 'Grünpflege',
    priority: 'low',
    status: 'done',
    assignRole: 'hausmeister',
    estimatedMinutes: 120,
  },
  {
    title: 'Wasserschaden Keller nach Rohrbruch',
    description: 'Nasse Wände im Kellerraum K-03. Fachfirma für Trocknung wartet auf Zusage.',
    propertyName: 'Villa am See',
    category: 'Sanitär',
    priority: 'high',
    status: 'blocked',
    deadlineDaysFromNow: 3,
  },
  {
    title: 'Winterdienst — Bereitschaftsplan Nov 2026',
    description: 'Bereitschaft für ersten Streueinsatz aktivieren, Streugut auffüllen.',
    propertyName: 'Bürocenter Königsallee 42',
    category: 'Winterdienst',
    priority: 'normal',
    status: 'new',
    deadlineDaysFromNow: 14,
  },
];

async function ensureWorkOrders(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
  employeesByRole: EmployeesByRole,
) {
  for (const wo of DEMO_WORK_ORDERS) {
    const propertyId = propertyIdByName.get(wo.propertyName);
    if (!propertyId) {
      console.warn(`  ! Property "${wo.propertyName}" nicht gefunden, überspringe Auftrag "${wo.title}"`);
      continue;
    }

    const existing = await supabase
      .from('work_orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('property_id', propertyId)
      .eq('title', wo.title)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing.data) continue;

    const deadline = wo.deadlineDaysFromNow !== undefined
      ? new Date(Date.now() + wo.deadlineDaysFromNow * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const assignee = wo.assignRole ? employeesByRole[wo.assignRole].employeeId : null;
    const closedAt = wo.status === 'done'
      ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error } = await supabase.from('work_orders').insert({
      tenant_id: tenantId,
      title: wo.title,
      description: wo.description ?? null,
      category: wo.category ?? null,
      priority: wo.priority,
      status: wo.status,
      property_id: propertyId,
      assignee_id: assignee,
      deadline,
      estimated_minutes: wo.estimatedMinutes ?? null,
      is_emergency: wo.isEmergency ?? false,
      closed_at: closedAt,
      closed_by: closedAt ? actorId : null,
      created_by: actorId,
      updated_by: actorId,
    });
    if (error) throw error;
  }
}

type DefectReportSpec = {
  title: string;
  description?: string;
  propertyName: string;
  category?: string;
  priority: 'low' | 'normal' | 'high' | 'emergency';
  status: 'new' | 'reviewing' | 'rejected';
  reporterKind: 'resident' | 'owner' | 'staff' | 'anonymous';
  reporterName?: string;
  reporterContact?: string;
  locationDetails?: string;
  rejectionReason?: string;
};

const DEMO_DEFECT_REPORTS: DefectReportSpec[] = [
  {
    title: 'Fahrradkeller-Tür schließt nicht mehr',
    description:
      'Die Tür zum Fahrradkeller klemmt seit gestern, lässt sich nur mit Kraft schließen und geht nachts von selbst auf.',
    propertyName: 'Wohnpark Rheinaue',
    category: 'Türen & Schlösser',
    priority: 'normal',
    status: 'new',
    reporterKind: 'resident',
    reporterName: 'Maria Schulz',
    reporterContact: 'maria.schulz@example.com',
    locationDetails: 'Haus A, Kellerabgang links',
  },
  {
    title: 'Rauchmelder piept im Treppenhaus 5. OG',
    description:
      'Seit heute Morgen dauerhaftes Piepen im Treppenhaus zwischen 5. und 6. OG. Vermutlich schwache Batterie.',
    propertyName: 'Bürocenter Königsallee 42',
    category: 'Brandschutz',
    priority: 'high',
    status: 'reviewing',
    reporterKind: 'owner',
    reporterName: 'Königsallee Immo GmbH',
    reporterContact: '+49 211 555 0100',
    locationDetails: 'Turm West, Treppenhaus 5. OG',
  },
  {
    title: 'Graffiti an Hausfassade',
    description: 'Neues Graffiti seit Wochenende an der Seitenwand.',
    propertyName: 'Wohnpark Rheinaue',
    category: 'Gebäudehülle',
    priority: 'low',
    status: 'rejected',
    reporterKind: 'anonymous',
    locationDetails: 'Haus B, Ostseite',
    rejectionReason:
      'Wird gebündelt mit anderen Fassadenarbeiten im Frühjahrsplan behandelt — nicht als Einzelauftrag.',
  },
];

async function ensureDefectReports(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
) {
  for (const spec of DEMO_DEFECT_REPORTS) {
    const propertyId = propertyIdByName.get(spec.propertyName);
    if (!propertyId) {
      console.warn(
        `  ! Property "${spec.propertyName}" nicht gefunden, überspringe Meldung "${spec.title}"`,
      );
      continue;
    }

    const existing = await supabase
      .from('defect_reports')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('property_id', propertyId)
      .eq('title', spec.title)
      .maybeSingle();
    if (existing.data) continue;

    const { error } = await supabase.from('defect_reports').insert({
      tenant_id: tenantId,
      title: spec.title,
      description: spec.description ?? null,
      category: spec.category ?? null,
      priority: spec.priority,
      status: spec.status,
      property_id: propertyId,
      reporter_kind: spec.reporterKind,
      reporter_name: spec.reporterName ?? null,
      reporter_contact: spec.reporterContact ?? null,
      location_details: spec.locationDetails ?? null,
      rejection_reason: spec.rejectionReason ?? null,
      created_by: actorId,
      updated_by: actorId,
    });
    if (error) throw error;
  }
}

type ResidentSpec = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  propertyName: string;
  buildingName?: string;
  unitCode?: string;
  movedIn?: string;
  movedOut?: string;
  notes?: string;
  /** Wenn true UND SEED_RESIDENT_PASSWORD in env: auth-User anlegen + user_id verknüpfen */
  portalEnabled?: boolean;
};

const DEMO_RESIDENTS: ResidentSpec[] = [
  {
    firstName: 'Maria',
    lastName: 'Schulz',
    email: 'maria.schulz@example.com',
    phone: '+49 228 555 0201',
    propertyName: 'Wohnpark Rheinaue',
    buildingName: 'Haus A',
    unitCode: '1.1',
    movedIn: '2024-05-01',
    portalEnabled: true,
  },
  {
    firstName: 'Ahmed',
    lastName: 'Yilmaz',
    email: 'ahmed.yilmaz@example.com',
    phone: '+49 228 555 0202',
    propertyName: 'Wohnpark Rheinaue',
    buildingName: 'Haus A',
    unitCode: '2.1',
    movedIn: '2023-11-15',
    portalEnabled: true,
  },
  {
    firstName: 'Petra',
    lastName: 'Weber',
    email: 'petra.weber@example.com',
    phone: '+49 228 555 0203',
    propertyName: 'Wohnpark Rheinaue',
    buildingName: 'Haus B',
    unitCode: '2.1',
    movedIn: '2025-02-10',
  },
  {
    firstName: 'Lukas',
    lastName: 'Berger',
    propertyName: 'Wohnpark Rheinaue',
    buildingName: 'Haus A',
    unitCode: '3.1',
    movedIn: '2022-08-01',
    movedOut: '2026-06-30',
    notes: 'Übergabe an Nachmieter erfolgt am 01.07.2026.',
  },
];

type OwnerSpec = {
  kind: 'individual' | 'company' | 'management';
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  properties: Array<{
    name: string;
    role?: 'owner' | 'co_owner' | 'management';
    share?: number;
  }>;
};

const DEMO_OWNERS: OwnerSpec[] = [
  {
    kind: 'management',
    companyName: 'Königsallee Immo GmbH',
    email: 'kontakt@koenigsallee-immo.example',
    phone: '+49 211 555 0100',
    street: 'Königsallee',
    houseNumber: '42',
    postalCode: '40212',
    city: 'Düsseldorf',
    properties: [{ name: 'Bürocenter Königsallee 42', role: 'management' }],
  },
  {
    kind: 'company',
    companyName: 'Rheinaue Wohnbau GmbH',
    email: 'verwaltung@rheinaue-wohnbau.example',
    phone: '+49 228 555 0300',
    street: 'Adenauerallee',
    houseNumber: '77',
    postalCode: '53113',
    city: 'Bonn',
    properties: [{ name: 'Wohnpark Rheinaue', role: 'owner', share: 100 }],
  },
  {
    kind: 'individual',
    firstName: 'Dr. Katharina',
    lastName: 'Voss',
    email: 'k.voss@example.com',
    phone: '+49 221 555 0400',
    street: 'Seepromenade',
    houseNumber: '7',
    postalCode: '50968',
    city: 'Köln',
    properties: [{ name: 'Villa am See', role: 'owner', share: 100 }],
  },
];

async function ensureResidents(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
) {
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, property_id, name')
    .eq('tenant_id', tenantId);
  const { data: units } = await supabase
    .from('units')
    .select('id, building_id, property_id, code')
    .eq('tenant_id', tenantId);

  const buildingByKey = new Map(
    (buildings ?? []).map((b) => [`${b.property_id}|${b.name}`, b]),
  );
  const unitByKey = new Map((units ?? []).map((u) => [`${u.building_id}|${u.code}`, u]));

  for (const spec of DEMO_RESIDENTS) {
    const propertyId = propertyIdByName.get(spec.propertyName);
    if (!propertyId) {
      console.warn(`  ! Property "${spec.propertyName}" fehlt, überspringe Bewohner ${spec.lastName}`);
      continue;
    }
    const building = spec.buildingName
      ? buildingByKey.get(`${propertyId}|${spec.buildingName}`)
      : null;
    const unit =
      spec.unitCode && building
        ? unitByKey.get(`${building.id}|${spec.unitCode}`)
        : null;

    const existing = await supabase
      .from('residents')
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .eq('first_name', spec.firstName)
      .eq('last_name', spec.lastName)
      .is('deleted_at', null)
      .maybeSingle();

    let residentId: string;
    if (existing.data) {
      residentId = existing.data.id;
    } else {
      const inserted = await supabase
        .from('residents')
        .insert({
          tenant_id: tenantId,
          first_name: spec.firstName,
          last_name: spec.lastName,
          email: spec.email ?? null,
          phone: spec.phone ?? null,
          property_id: propertyId,
          building_id: building?.id ?? null,
          unit_id: unit?.id ?? null,
          moved_in: spec.movedIn ?? null,
          moved_out: spec.movedOut ?? null,
          notes: spec.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw inserted.error ?? new Error('insert failed');
      residentId = inserted.data.id;
    }

    // Portal-Zugang (nur wenn spec.portalEnabled + email + Passwort in env)
    if (spec.portalEnabled && spec.email) {
      const portalPassword = process.env.SEED_RESIDENT_PASSWORD;
      if (!portalPassword) {
        console.warn(
          `  ! SEED_RESIDENT_PASSWORD nicht gesetzt – Portal-Zugang für ${spec.email} übersprungen.`,
        );
        continue;
      }

      // Existiert der auth-User schon?
      const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      let userId = list.data.users.find(
        (u) => (u.email ?? '').toLowerCase() === spec.email!.toLowerCase(),
      )?.id;

      if (!userId) {
        const created = await supabase.auth.admin.createUser({
          email: spec.email,
          password: portalPassword,
          email_confirm: true,
          user_metadata: {
            resident_id: residentId,
            first_name: spec.firstName,
            last_name: spec.lastName,
          },
        });
        if (created.error || !created.data.user) {
          console.warn(
            `  ! Konnte Portal-User für ${spec.email} nicht anlegen: ${created.error?.message ?? 'unknown'}`,
          );
          continue;
        }
        userId = created.data.user.id;
      }

      const nowIso = new Date().toISOString();
      const upd = await supabase
        .from('residents')
        .update({
          user_id: userId,
          portal_invited_at: nowIso,
          portal_activated_at: nowIso,
          updated_by: actorId,
        })
        .eq('id', residentId)
        .is('user_id', null);
      if (upd.error) {
        console.warn(`  ! Konnte user_id nicht verknüpfen: ${upd.error.message}`);
      }
    }
  }
}

async function ensureOwners(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
) {
  for (const spec of DEMO_OWNERS) {
    const identifier = spec.companyName ?? `${spec.firstName} ${spec.lastName}`;
    let ownerId: string;

    const existing = await supabase
      .from('owners')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('kind', spec.kind)
      .eq(spec.kind === 'individual' ? 'last_name' : 'company_name',
        spec.kind === 'individual' ? spec.lastName! : spec.companyName!)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing.data) {
      ownerId = existing.data.id;
    } else {
      const inserted = await supabase
        .from('owners')
        .insert({
          tenant_id: tenantId,
          kind: spec.kind,
          first_name: spec.firstName ?? null,
          last_name: spec.lastName ?? null,
          company_name: spec.companyName ?? null,
          email: spec.email ?? null,
          phone: spec.phone ?? null,
          street: spec.street ?? null,
          house_number: spec.houseNumber ?? null,
          postal_code: spec.postalCode ?? null,
          city: spec.city ?? null,
          country: 'DE',
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error) throw inserted.error;
      ownerId = inserted.data.id;
    }

    for (const pRef of spec.properties) {
      const propertyId = propertyIdByName.get(pRef.name);
      if (!propertyId) {
        console.warn(`  ! Property "${pRef.name}" fehlt für Owner ${identifier}`);
        continue;
      }
      const existingLink = await supabase
        .from('owner_properties')
        .select('owner_id')
        .eq('owner_id', ownerId)
        .eq('property_id', propertyId)
        .maybeSingle();
      if (existingLink.data) continue;

      const { error } = await supabase.from('owner_properties').insert({
        tenant_id: tenantId,
        owner_id: ownerId,
        property_id: propertyId,
        role: pRef.role ?? 'owner',
        share_percent: pRef.share ?? null,
      });
      if (error) throw error;
    }
  }
}

type MaintenancePlanSpec = {
  title: string;
  description?: string;
  category?: string;
  propertyName: string;
  intervalDays: number;
  estimatedMinutes?: number;
  priority?: 'low' | 'normal' | 'high' | 'emergency';
  assignedRole?: string;
  nextDueDaysFromNow: number;
  active?: boolean;
};

const DEMO_MAINTENANCE_PLANS: MaintenancePlanSpec[] = [
  {
    title: 'Heizung – Jahreswartung',
    description: 'Vollprüfung inkl. Brennerreinigung und Abgasmessung.',
    category: 'Heizung',
    propertyName: 'Wohnpark Rheinaue',
    intervalDays: 365,
    estimatedMinutes: 180,
    priority: 'high',
    assignedRole: 'Technik',
    nextDueDaysFromNow: 21,
  },
  {
    title: 'Rauchmelder-Prüfung',
    description: 'Sichtkontrolle und Funktionstest aller Rauchmelder gemäß DIN 14676.',
    category: 'Brandschutz',
    propertyName: 'Wohnpark Rheinaue',
    intervalDays: 365,
    estimatedMinutes: 90,
    priority: 'high',
    assignedRole: 'Hausmeister',
    nextDueDaysFromNow: -3,
  },
  {
    title: 'Aufzug – Monatliche Sichtprüfung',
    description: 'Sichtkontrolle Aufzugsanlage, Fangvorrichtung, Notruftaste.',
    category: 'Aufzug',
    propertyName: 'Bürocenter Königsallee 42',
    intervalDays: 30,
    estimatedMinutes: 45,
    priority: 'high',
    assignedRole: 'Technik',
    nextDueDaysFromNow: 5,
  },
  {
    title: 'Grünpflege Innenhof',
    description: 'Rasen mähen, Hecken schneiden, Wege kehren.',
    category: 'Grünpflege',
    propertyName: 'Wohnpark Rheinaue',
    intervalDays: 14,
    estimatedMinutes: 120,
    priority: 'normal',
    assignedRole: 'Hausmeister',
    nextDueDaysFromNow: 2,
  },
  {
    title: 'Filterwechsel Lüftungsanlage',
    description: 'Filter der zentralen Lüftungsanlage tauschen.',
    category: 'Lüftung',
    propertyName: 'Bürocenter Königsallee 42',
    intervalDays: 90,
    estimatedMinutes: 60,
    priority: 'normal',
    assignedRole: 'Technik',
    nextDueDaysFromNow: 45,
  },
];

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function ensureMaintenancePlans(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
) {
  for (const spec of DEMO_MAINTENANCE_PLANS) {
    const propertyId = propertyIdByName.get(spec.propertyName);
    if (!propertyId) {
      console.warn(
        `  ! Property "${spec.propertyName}" fehlt, überspringe Wartungsplan "${spec.title}"`,
      );
      continue;
    }

    const existing = await supabase
      .from('maintenance_plans')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('property_id', propertyId)
      .eq('title', spec.title)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing.data) continue;

    const { error } = await supabase.from('maintenance_plans').insert({
      tenant_id: tenantId,
      title: spec.title,
      description: spec.description ?? null,
      category: spec.category ?? null,
      property_id: propertyId,
      interval_days: spec.intervalDays,
      estimated_minutes: spec.estimatedMinutes ?? null,
      priority: spec.priority ?? 'normal',
      assigned_role: spec.assignedRole ?? null,
      next_due_at: isoDatePlusDays(spec.nextDueDaysFromNow),
      active: spec.active ?? true,
      created_by: actorId,
      updated_by: actorId,
    });
    if (error) throw error;
  }
}

type ChecklistItemSpec = {
  kind: 'check' | 'text' | 'number' | 'photo';
  label: string;
  helpText?: string;
  required?: boolean;
  unit?: string;
  min?: number;
  max?: number;
};

type ChecklistTemplateSpec = {
  title: string;
  description?: string;
  category?: string;
  items: ChecklistItemSpec[];
};

const DEMO_CHECKLIST_TEMPLATES: ChecklistTemplateSpec[] = [
  {
    title: 'Rauchmelder-Wartung DIN 14676',
    description: 'Jährliche Sichtkontrolle und Funktionstest gemäß DIN 14676 pro Einheit.',
    category: 'Brandschutz',
    items: [
      { kind: 'check', label: 'Sichtkontrolle Gehäuse unbeschädigt', required: true },
      { kind: 'check', label: 'Rauchöffnungen frei von Staub / Insekten', required: true },
      { kind: 'check', label: 'Funktionstest per Prüftaste (Signal ertönt)', required: true },
      {
        kind: 'number',
        label: 'Batteriespannung',
        unit: 'V',
        min: 8,
        max: 10,
        helpText: 'Bei < 8 V Batterie tauschen.',
      },
      { kind: 'text', label: 'Auffälligkeiten', helpText: 'Nur bei Bedarf ausfüllen.' },
      { kind: 'photo', label: 'Foto des geprüften Melders' },
    ],
  },
  {
    title: 'Heizungs-Jahreswartung',
    description: 'Vollständige Prüfung Heizzentrale inkl. Abgasmessung.',
    category: 'Heizung',
    items: [
      { kind: 'check', label: 'Sichtprüfung Kessel und Anschlüsse', required: true },
      { kind: 'check', label: 'Brennkammer gereinigt', required: true },
      { kind: 'number', label: 'Vorlauftemperatur', unit: '°C', min: 50, max: 90, required: true },
      { kind: 'number', label: 'Rücklauftemperatur', unit: '°C', min: 30, max: 70 },
      { kind: 'number', label: 'Abgastemperatur', unit: '°C', max: 200 },
      { kind: 'number', label: 'CO₂-Gehalt Abgas', unit: '%', min: 8, max: 14 },
      { kind: 'check', label: 'Sicherheitsventil geprüft', required: true },
      { kind: 'text', label: 'Empfehlungen für den Betreiber' },
      { kind: 'photo', label: 'Foto Messgeräte-Anzeige' },
    ],
  },
];

async function ensureChecklistTemplates(tenantId: string, actorId: string) {
  for (const spec of DEMO_CHECKLIST_TEMPLATES) {
    let templateId: string;
    const existing = await supabase
      .from('checklist_templates')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('title', spec.title)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing.data) {
      templateId = existing.data.id;
      const itemCount = await supabase
        .from('checklist_template_items')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', templateId);
      if ((itemCount.count ?? 0) > 0) continue;
    } else {
      const inserted = await supabase
        .from('checklist_templates')
        .insert({
          tenant_id: tenantId,
          title: spec.title,
          description: spec.description ?? null,
          category: spec.category ?? null,
          active: true,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error) throw inserted.error;
      templateId = inserted.data.id;
    }

    for (let i = 0; i < spec.items.length; i++) {
      const item = spec.items[i]!;
      const { error } = await supabase.from('checklist_template_items').insert({
        tenant_id: tenantId,
        template_id: templateId,
        position: i + 1,
        kind: item.kind,
        label: item.label,
        help_text: item.helpText ?? null,
        required: item.required ?? false,
        unit: item.unit ?? null,
        min_value: item.min ?? null,
        max_value: item.max ?? null,
      });
      if (error) throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Zeit-Einträge, Kalender, Korrekturanträge
// ---------------------------------------------------------------------------

/** Liefert die letzten `count` Werktage (ohne heute), älteste zuerst. */
function getPastWorkdays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < count) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) continue;
    days.push(new Date(cursor));
  }
  return days.reverse();
}

/** Liefert die nächsten `count` Werktage (ohne heute). */
function getFutureWorkdays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) continue;
    days.push(new Date(cursor));
  }
  return days;
}

function withTime(day: Date, hour: number, minute = 0): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

type SeededTimeEntry = {
  id: string;
  userId: string;
  employeeId: string;
  startAt: string;
  endAt: string;
  propertyId: string | null;
  workOrderId: string | null;
};

type TimeEntrySlot = {
  kind: 'work' | 'break' | 'travel' | 'standby';
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  useWorkOrder?: boolean;
  usePropertyFallback?: boolean;
  note?: string | null;
};

const HAUSMEISTER_SLOTS: TimeEntrySlot[] = [
  { kind: 'work', startHour: 8, endHour: 12, useWorkOrder: true, note: 'Vormittag beim Objekt.' },
  { kind: 'break', startHour: 12, endHour: 12, endMinute: 30 },
  { kind: 'work', startHour: 12, startMinute: 30, endHour: 17, usePropertyFallback: true },
];

const DISPONENT_SLOTS: TimeEntrySlot[] = [
  { kind: 'work', startHour: 8, endHour: 12, note: 'Einsatzplanung, Rückrufe.' },
  { kind: 'break', startHour: 12, endHour: 13 },
  { kind: 'work', startHour: 13, endHour: 16, note: 'Auftragsbearbeitung.' },
];

async function ensureTimeEntries(
  tenantId: string,
  employeesByRole: EmployeesByRole,
  actorId: string,
  propertyIdByName: Map<string, string>,
): Promise<SeededTimeEntry[]> {
  const workdays = getPastWorkdays(10);

  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('id, property_id, title')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  const orderedWorkOrders = (workOrders ?? []).filter((w) => !!w.property_id);
  const propertyIds = Array.from(propertyIdByName.values());

  const rolePlans: Array<{ role: 'hausmeister' | 'disponent'; slots: TimeEntrySlot[] }> = [
    { role: 'hausmeister', slots: HAUSMEISTER_SLOTS },
    { role: 'disponent', slots: DISPONENT_SLOTS },
  ];

  const result: SeededTimeEntry[] = [];

  for (const plan of rolePlans) {
    const emp = employeesByRole[plan.role];

    for (let dayIdx = 0; dayIdx < workdays.length; dayIdx++) {
      const day = workdays[dayIdx]!;
      const rotatingWo = orderedWorkOrders[dayIdx % Math.max(orderedWorkOrders.length, 1)];
      const rotatingProperty = propertyIds[dayIdx % Math.max(propertyIds.length, 1)];

      for (const slot of plan.slots) {
        const start = withTime(day, slot.startHour, slot.startMinute ?? 0);
        const end = withTime(day, slot.endHour, slot.endMinute ?? 0);
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        const existing = await supabase
          .from('time_entries')
          .select('id, property_id, work_order_id')
          .eq('user_id', emp.userId)
          .eq('start_at', startIso)
          .maybeSingle();

        if (existing.data) {
          result.push({
            id: existing.data.id,
            userId: emp.userId,
            employeeId: emp.employeeId,
            startAt: startIso,
            endAt: endIso,
            propertyId: existing.data.property_id ?? null,
            workOrderId: existing.data.work_order_id ?? null,
          });
          continue;
        }

        const workOrderId =
          slot.useWorkOrder && rotatingWo ? rotatingWo.id : null;
        const propertyId = workOrderId
          ? rotatingWo?.property_id ?? null
          : slot.usePropertyFallback
            ? rotatingProperty ?? null
            : null;

        const inserted = await supabase
          .from('time_entries')
          .insert({
            tenant_id: tenantId,
            employee_id: emp.employeeId,
            user_id: emp.userId,
            kind: slot.kind,
            start_at: startIso,
            end_at: endIso,
            work_order_id: workOrderId,
            property_id: propertyId,
            note: slot.note ?? null,
            source: 'punch',
            created_by: actorId,
            updated_by: actorId,
          })
          .select('id')
          .single();
        if (inserted.error) throw inserted.error;

        result.push({
          id: inserted.data.id,
          userId: emp.userId,
          employeeId: emp.employeeId,
          startAt: startIso,
          endAt: endIso,
          propertyId,
          workOrderId,
        });
      }
    }
  }

  return result;
}

type ScheduleSpec = {
  role: 'hausmeister' | 'disponent';
  kind: 'availability' | 'unavailability' | 'meeting' | 'training' | 'standby' | 'other';
  title: string;
  note?: string;
  dayOffset: number;
  startHour: number;
  endHour: number;
  allDay?: boolean;
};

const DEMO_SCHEDULE_ENTRIES: ScheduleSpec[] = [
  {
    role: 'hausmeister',
    kind: 'meeting',
    title: 'Objektbegehung Wohnpark Rheinaue',
    note: 'Gemeinsam mit Hausverwaltung, Treffpunkt Haus A.',
    dayOffset: 1,
    startHour: 9,
    endHour: 11,
  },
  {
    role: 'hausmeister',
    kind: 'training',
    title: 'Sicherheitsunterweisung Heizungsanlagen',
    dayOffset: 2,
    startHour: 13,
    endHour: 16,
  },
  {
    role: 'hausmeister',
    kind: 'unavailability',
    title: 'Arzttermin',
    dayOffset: 3,
    startHour: 8,
    endHour: 10,
  },
  {
    role: 'hausmeister',
    kind: 'standby',
    title: 'Rufbereitschaft',
    note: 'Wochenend-Bereitschaft, 24h.',
    dayOffset: 4,
    startHour: 0,
    endHour: 24,
    allDay: true,
  },
  {
    role: 'disponent',
    kind: 'meeting',
    title: 'Wochenplanung mit Team',
    note: 'Auftragslage, Priorisierung, Ressourcen.',
    dayOffset: 1,
    startHour: 8,
    endHour: 9,
  },
  {
    role: 'disponent',
    kind: 'meeting',
    title: 'Kundengespräch Königsallee Immo',
    dayOffset: 2,
    startHour: 10,
    endHour: 11,
  },
  {
    role: 'disponent',
    kind: 'training',
    title: 'Schulung neues Zeiterfassungs-Modul',
    dayOffset: 3,
    startHour: 14,
    endHour: 16,
  },
  {
    role: 'disponent',
    kind: 'unavailability',
    title: 'Urlaub',
    dayOffset: 5,
    startHour: 0,
    endHour: 24,
    allDay: true,
  },
];

async function ensureScheduleEntries(
  tenantId: string,
  employeesByRole: EmployeesByRole,
  actorId: string,
) {
  const futureDays = getFutureWorkdays(10);

  for (const spec of DEMO_SCHEDULE_ENTRIES) {
    const emp = employeesByRole[spec.role];
    const day = futureDays[spec.dayOffset - 1];
    if (!day) continue;

    const start = withTime(day, spec.startHour);
    const end = spec.allDay
      ? withTime(new Date(day.getTime() + 24 * 60 * 60 * 1000), 0)
      : withTime(day, spec.endHour);
    const startIso = start.toISOString();

    const existing = await supabase
      .from('schedule_entries')
      .select('id')
      .eq('user_id', emp.userId)
      .eq('start_at', startIso)
      .eq('title', spec.title)
      .maybeSingle();
    if (existing.data) continue;

    const { error } = await supabase.from('schedule_entries').insert({
      tenant_id: tenantId,
      employee_id: emp.employeeId,
      user_id: emp.userId,
      kind: spec.kind,
      title: spec.title,
      note: spec.note ?? null,
      start_at: startIso,
      end_at: end.toISOString(),
      all_day: spec.allDay ?? false,
      created_by: actorId,
      updated_by: actorId,
    });
    if (error) throw error;
  }
}

async function ensureTimeCorrections(
  tenantId: string,
  employeesByRole: EmployeesByRole,
  ownerUserId: string,
  seeded: SeededTimeEntry[],
) {
  const hausmeister = employeesByRole.hausmeister;
  const hausmeisterEntries = seeded
    .filter((e) => e.userId === hausmeister.userId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  if (hausmeisterEntries.length < 3) {
    console.warn('  ! Zu wenige Time-Entries für Corrections, überspringe.');
    return;
  }

  const entryForPending = hausmeisterEntries[hausmeisterEntries.length - 1]!;
  const entryForApproved = hausmeisterEntries[Math.floor(hausmeisterEntries.length / 2)]!;
  const entryForRejected = hausmeisterEntries[0]!;

  const nowIso = new Date().toISOString();
  const decidedApprovedIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const decidedRejectedIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  // 1) Pending: Hausmeister möchte 30 min später Feierabend
  const pendingReason = 'Überstunden wurden vergessen zu stempeln.';
  const pendingProposedEnd = new Date(
    new Date(entryForPending.endAt).getTime() + 30 * 60 * 1000,
  ).toISOString();

  const existingPending = await supabase
    .from('time_entry_corrections')
    .select('id')
    .eq('time_entry_id', entryForPending.id)
    .eq('requested_by', hausmeister.userId)
    .eq('reason', pendingReason)
    .maybeSingle();
  if (!existingPending.data) {
    const { error } = await supabase.from('time_entry_corrections').insert({
      tenant_id: tenantId,
      time_entry_id: entryForPending.id,
      entry_user_id: hausmeister.userId,
      requested_by: hausmeister.userId,
      requested_at: nowIso,
      reason: pendingReason,
      status: 'pending',
      proposed_end_at: pendingProposedEnd,
    });
    if (error) throw error;
  }

  // 2) Approved: Objekt-Zuordnung korrigiert; Antrag durch, Patch angewendet
  const approvedReason = 'Falsches Objekt gestempelt — war in Villa am See.';
  const villaLookup = await supabase
    .from('properties')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', 'Villa am See')
    .is('deleted_at', null)
    .maybeSingle();
  const propertyIdVilla = villaLookup.data?.id ?? null;

  if (propertyIdVilla) {
    const existingApproved = await supabase
      .from('time_entry_corrections')
      .select('id')
      .eq('time_entry_id', entryForApproved.id)
      .eq('requested_by', hausmeister.userId)
      .eq('reason', approvedReason)
      .maybeSingle();
    if (!existingApproved.data) {
      const { error: corrErr } = await supabase.from('time_entry_corrections').insert({
        tenant_id: tenantId,
        time_entry_id: entryForApproved.id,
        entry_user_id: hausmeister.userId,
        requested_by: hausmeister.userId,
        requested_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        reason: approvedReason,
        status: 'approved',
        proposed_property_id: propertyIdVilla,
        decided_by: ownerUserId,
        decided_at: decidedApprovedIso,
        decision_note: 'Passt, Wechsel wurde protokolliert.',
      });
      if (corrErr) throw corrErr;

      // Patch auf time_entries anwenden — so wie es die Approve-Action
      // in Produktion tut: property setzen, source auf "correction".
      const { error: applyErr } = await supabase
        .from('time_entries')
        .update({
          property_id: propertyIdVilla,
          source: 'correction',
          updated_by: ownerUserId,
        })
        .eq('id', entryForApproved.id);
      if (applyErr) throw applyErr;
    }
  }

  // 3) Rejected: Kind-Änderung, Approver hat abgelehnt
  const rejectedReason = 'Arbeitszeit soll als Fahrt umgebucht werden.';

  const existingRejected = await supabase
    .from('time_entry_corrections')
    .select('id')
    .eq('time_entry_id', entryForRejected.id)
    .eq('requested_by', hausmeister.userId)
    .eq('reason', rejectedReason)
    .maybeSingle();
  if (!existingRejected.data) {
    const { error } = await supabase.from('time_entry_corrections').insert({
      tenant_id: tenantId,
      time_entry_id: entryForRejected.id,
      entry_user_id: hausmeister.userId,
      requested_by: hausmeister.userId,
      requested_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      reason: rejectedReason,
      status: 'rejected',
      proposed_kind: 'travel',
      decided_by: ownerUserId,
      decided_at: decidedRejectedIso,
      decision_note: 'Bitte künftig direkt korrekt stempeln, keine nachträgliche Umbuchung.',
    });
    if (error) throw error;
  }
}

type DemoKey = {
  propertyName: string;
  label: string;
  identifier?: string;
  kind: 'main' | 'apartment' | 'mailbox' | 'basement' | 'technical' | 'gate' | 'transponder' | 'other';
  copiesTotal: number;
  storageLocation?: string;
  notes?: string;
  // Handover-Sequenz: wird in Reihenfolge angelegt. `holderRoleKey` = 'hausmeister'|'disponent'|null.
  // Bei null wird holder_name aus externalName gebildet.
  handovers?: Array<
    | {
        kind: 'issue';
        holderRoleKey?: 'hausmeister' | 'disponent';
        externalName?: string;
        externalKind?: 'resident' | 'owner' | 'external';
        contact?: string;
        copies: number;
        expectedReturnInDays?: number;
        note?: string;
        // wenn 'returnAfterHours' gesetzt: dieselbe issue bekommt sofort ein return-Event
        returnAfterHours?: number;
      }
    | { kind: 'lost'; copies: number; note?: string }
    | { kind: 'retired'; note?: string }
    | { kind: 'replaced'; copies: number; note?: string }
  >;
};

const DEMO_KEYS: DemoKey[] = [
  {
    propertyName: 'Wohnpark Rheinaue',
    label: 'Haupteingang Haus A',
    identifier: 'RA-A-01',
    kind: 'main',
    copiesTotal: 3,
    storageLocation: 'Schlüsselschrank A · Fach 12',
    notes: 'Sperrgruppe SG-1 (Haupteingänge Rheinaue).',
    handovers: [
      {
        kind: 'issue',
        holderRoleKey: 'hausmeister',
        copies: 2,
        note: 'Für Tagesroutine ausgegeben.',
      },
    ],
  },
  {
    propertyName: 'Wohnpark Rheinaue',
    label: 'Kellerzugang K-01',
    identifier: 'RA-K-01',
    kind: 'basement',
    copiesTotal: 2,
    storageLocation: 'Schlüsselschrank A · Fach 14',
  },
  {
    propertyName: 'Wohnpark Rheinaue',
    label: 'Tiefgaragen-Transponder',
    identifier: 'TG-CHIP-14',
    kind: 'transponder',
    copiesTotal: 4,
    storageLocation: 'Bürotresor',
    handovers: [
      {
        kind: 'issue',
        holderRoleKey: 'disponent',
        copies: 1,
        note: 'Termin-Zufahrt Handwerker.',
        returnAfterHours: 6,
      },
    ],
  },
  {
    propertyName: 'Bürocenter Königsallee 42',
    label: 'Ladenlokal EG-01',
    identifier: 'BK-EG01',
    kind: 'apartment',
    copiesTotal: 1,
    storageLocation: 'Schlüsselschrank B · Fach 03',
    handovers: [
      {
        kind: 'issue',
        externalName: 'Fa. Meier Fashion GmbH',
        externalKind: 'external',
        contact: 'kontakt@meier-fashion.de',
        copies: 1,
        expectedReturnInDays: 30,
        note: 'Mieter-Übergabe, Rückgabe zum Monatsende geplant.',
      },
    ],
  },
  {
    propertyName: 'Bürocenter Königsallee 42',
    label: 'Büroetage 5-01',
    identifier: 'BK-501',
    kind: 'apartment',
    copiesTotal: 2,
    storageLocation: 'Schlüsselschrank B · Fach 05',
  },
  {
    propertyName: 'Villa am See',
    label: 'Haustürschlüssel Haupthaus',
    identifier: 'VS-HT-01',
    kind: 'main',
    copiesTotal: 2,
    storageLocation: 'Schlüsselschrank C · Fach 01',
    notes: 'Ersatzschlüssel im versiegelten Umschlag.',
    handovers: [
      {
        kind: 'issue',
        holderRoleKey: 'hausmeister',
        copies: 1,
        note: 'Grünanlagenpflege am Wochenende.',
        returnAfterHours: 48,
      },
    ],
  },
  {
    propertyName: 'Villa am See',
    label: 'Torschlüssel Einfahrt',
    identifier: 'VS-TOR-01',
    kind: 'gate',
    copiesTotal: 1,
    storageLocation: 'Schlüsselschrank C · Fach 02',
  },
];

async function ensureKeys(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
  employeesByRole: EmployeesByRole,
) {
  for (const spec of DEMO_KEYS) {
    const propertyId = propertyIdByName.get(spec.propertyName);
    if (!propertyId) {
      console.warn(`  ! Property "${spec.propertyName}" nicht gefunden, überspringe ${spec.label}.`);
      continue;
    }

    // Existierenden Key finden — idempotent per (tenant_id, property_id, label).
    const existing = await supabase
      .from('keys')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('property_id', propertyId)
      .eq('label', spec.label)
      .is('deleted_at', null)
      .maybeSingle();

    let keyId: string;
    if (existing.data) {
      keyId = existing.data.id;
    } else {
      const inserted = await supabase
        .from('keys')
        .insert({
          tenant_id: tenantId,
          property_id: propertyId,
          label: spec.label,
          identifier: spec.identifier ?? null,
          kind: spec.kind,
          copies_total: spec.copiesTotal,
          storage_location: spec.storageLocation ?? null,
          notes: spec.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw inserted.error;
      keyId = inserted.data.id;
    }

    // Handovers nur seeden, wenn noch keine existieren (Idempotenz-Schutz).
    const existingHandovers = await supabase
      .from('key_handovers')
      .select('id')
      .eq('key_id', keyId)
      .limit(1);
    if ((existingHandovers.data?.length ?? 0) > 0) continue;

    for (const h of spec.handovers ?? []) {
      if (h.kind === 'issue') {
        const holder = h.holderRoleKey ? employeesByRole[h.holderRoleKey] : null;
        const happenedAt = new Date(
          Date.now() - (h.returnAfterHours ? h.returnAfterHours * 60 * 60 * 1000 + 60 * 60 * 1000 : 24 * 60 * 60 * 1000),
        ).toISOString();
        const expectedReturnAt = h.expectedReturnInDays
          ? new Date(Date.now() + h.expectedReturnInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;

        const issueRes = await supabase
          .from('key_handovers')
          .insert({
            tenant_id: tenantId,
            key_id: keyId,
            property_id: propertyId,
            kind: 'issue',
            happened_at: happenedAt,
            expected_return_at: expectedReturnAt,
            holder_kind: holder ? 'employee' : h.externalKind ?? 'external',
            holder_user_id: holder?.userId ?? null,
            holder_name: holder ? null : h.externalName ?? '(unbekannt)',
            holder_contact: h.contact ?? null,
            copies_count: h.copies,
            note: h.note ?? null,
            performed_by: actorId,
          })
          .select('id')
          .single();
        if (issueRes.error || !issueRes.data) throw issueRes.error;

        if (h.returnAfterHours) {
          const returnedAt = new Date(
            new Date(happenedAt).getTime() + h.returnAfterHours * 60 * 60 * 1000,
          ).toISOString();
          const returnRes = await supabase.from('key_handovers').insert({
            tenant_id: tenantId,
            key_id: keyId,
            property_id: propertyId,
            kind: 'return',
            happened_at: returnedAt,
            issue_handover_id: issueRes.data.id,
            copies_count: h.copies,
            note: 'Zurück im Bestand.',
            performed_by: actorId,
          });
          if (returnRes.error) throw returnRes.error;
        }
      } else if (h.kind === 'lost') {
        const res = await supabase.from('key_handovers').insert({
          tenant_id: tenantId,
          key_id: keyId,
          property_id: propertyId,
          kind: 'lost',
          copies_count: h.copies,
          note: h.note ?? null,
          performed_by: actorId,
        });
        if (res.error) throw res.error;
        await supabase.from('keys').update({ status: 'lost', updated_by: actorId }).eq('id', keyId);
      } else if (h.kind === 'retired') {
        const res = await supabase.from('key_handovers').insert({
          tenant_id: tenantId,
          key_id: keyId,
          property_id: propertyId,
          kind: 'retired',
          note: h.note ?? null,
          performed_by: actorId,
        });
        if (res.error) throw res.error;
        await supabase.from('keys').update({ status: 'retired', updated_by: actorId }).eq('id', keyId);
      } else if (h.kind === 'replaced') {
        const res = await supabase.from('key_handovers').insert({
          tenant_id: tenantId,
          key_id: keyId,
          property_id: propertyId,
          kind: 'replaced',
          copies_count: h.copies,
          note: h.note ?? null,
          performed_by: actorId,
        });
        if (res.error) throw res.error;
      }
    }
  }
}

type DemoMeterReading = {
  daysAgo: number;
  reading: number;
  source?: 'manual' | 'photo' | 'estimated' | 'gateway';
  isReset?: boolean;
  note?: string;
};

type DemoMeter = {
  propertyName: string;
  label: string;
  meterNumber?: string;
  utilityKind: 'electricity' | 'gas' | 'water_cold' | 'water_hot' | 'heating' | 'heat_cost_allocator' | 'other';
  unitOfMeasure: string;
  locationNote?: string;
  digitsBefore?: number;
  digitsAfter?: number;
  installedAt?: string;
  notes?: string;
  readings: DemoMeterReading[];
};

const DEMO_METERS: DemoMeter[] = [
  {
    propertyName: 'Wohnpark Rheinaue',
    label: 'Allgemeinstrom Haus A',
    meterNumber: '1EMH0010012345',
    utilityKind: 'electricity',
    unitOfMeasure: 'kWh',
    locationNote: 'Keller K-01, Zählerschrank links',
    installedAt: '2022-03-15',
    readings: [
      { daysAgo: 180, reading: 12450 },
      { daysAgo: 90, reading: 13820, note: 'Halbjahresablesung' },
      { daysAgo: 5, reading: 14612.5 },
    ],
  },
  {
    propertyName: 'Wohnpark Rheinaue',
    label: 'Gaszähler Heizzentrale',
    meterNumber: 'G4-4711-0987',
    utilityKind: 'gas',
    unitOfMeasure: 'm³',
    locationNote: 'Heizraum, Wand rechts',
    installedAt: '2020-10-01',
    readings: [
      { daysAgo: 180, reading: 4820 },
      { daysAgo: 90, reading: 5610, note: 'Winterperiode' },
      { daysAgo: 5, reading: 5990 },
    ],
  },
  {
    propertyName: 'Wohnpark Rheinaue',
    label: 'Kaltwasser Haus B',
    meterNumber: 'W-CB-2025-001',
    utilityKind: 'water_cold',
    unitOfMeasure: 'm³',
    locationNote: 'Keller Haus B',
    installedAt: '2025-01-10',
    readings: [
      { daysAgo: 60, reading: 128.4 },
      { daysAgo: 5, reading: 168.9 },
    ],
  },
  {
    propertyName: 'Bürocenter Königsallee 42',
    label: 'Hauptstromzähler Turm West',
    meterNumber: '2SDM230-EG12',
    utilityKind: 'electricity',
    unitOfMeasure: 'kWh',
    locationNote: 'Technikraum EG',
    installedAt: '2019-08-01',
    readings: [
      { daysAgo: 90, reading: 88420, note: 'Kunde 5-01' },
      { daysAgo: 30, reading: 91350 },
      { daysAgo: 2, reading: 93012 },
    ],
  },
  {
    propertyName: 'Bürocenter Königsallee 42',
    label: 'Wärmemenge Fernwärme',
    meterNumber: 'HM-K42-01',
    utilityKind: 'heating',
    unitOfMeasure: 'kWh',
    locationNote: 'Technikraum EG',
    installedAt: '2019-08-01',
    readings: [
      { daysAgo: 90, reading: 210500 },
      { daysAgo: 2, reading: 224180 },
    ],
  },
  {
    propertyName: 'Villa am See',
    label: 'Stromzähler Haupthaus',
    meterNumber: '1EMH0025-VS',
    utilityKind: 'electricity',
    unitOfMeasure: 'kWh',
    locationNote: 'HAR im UG',
    installedAt: '2018-06-01',
    readings: [
      { daysAgo: 120, reading: 32450 },
      { daysAgo: 30, reading: 33210 },
      { daysAgo: 3, reading: 33580 },
    ],
  },
  {
    propertyName: 'Villa am See',
    label: 'Kaltwasser',
    meterNumber: 'W-VS-01',
    utilityKind: 'water_cold',
    unitOfMeasure: 'm³',
    locationNote: 'UG neben Heizung',
    installedAt: '2018-06-01',
    readings: [
      { daysAgo: 120, reading: 385.2 },
      { daysAgo: 3, reading: 402.7 },
    ],
  },
];

async function ensureMeters(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
) {
  for (const spec of DEMO_METERS) {
    const propertyId = propertyIdByName.get(spec.propertyName);
    if (!propertyId) {
      console.warn(`  ! Property "${spec.propertyName}" nicht gefunden, überspringe ${spec.label}.`);
      continue;
    }

    // Idempotent per (tenant_id, property_id, label).
    const existing = await supabase
      .from('meters')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('property_id', propertyId)
      .eq('label', spec.label)
      .is('deleted_at', null)
      .maybeSingle();

    let meterId: string;
    if (existing.data) {
      meterId = existing.data.id;
    } else {
      const inserted = await supabase
        .from('meters')
        .insert({
          tenant_id: tenantId,
          property_id: propertyId,
          label: spec.label,
          meter_number: spec.meterNumber ?? null,
          utility_kind: spec.utilityKind,
          unit_of_measure: spec.unitOfMeasure,
          location_note: spec.locationNote ?? null,
          digits_before: spec.digitsBefore ?? 5,
          digits_after: spec.digitsAfter ?? 0,
          installed_at: spec.installedAt ?? null,
          notes: spec.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw inserted.error;
      meterId = inserted.data.id;
    }

    // Nur seeden wenn noch keine Readings vorhanden sind.
    const existingReadings = await supabase
      .from('meter_readings')
      .select('id')
      .eq('meter_id', meterId)
      .limit(1);
    if ((existingReadings.data?.length ?? 0) > 0) continue;

    // Chronologisch anlegen (älteste zuerst).
    const sorted = [...spec.readings].sort((a, b) => b.daysAgo - a.daysAgo);
    for (const r of sorted) {
      const readAt = new Date(Date.now() - r.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      const res = await supabase.from('meter_readings').insert({
        tenant_id: tenantId,
        meter_id: meterId,
        property_id: propertyId,
        read_at: readAt,
        reading: r.reading,
        source: r.source ?? 'manual',
        is_reset: r.isReset ?? false,
        note: r.note ?? null,
        created_by: actorId,
      });
      if (res.error) throw res.error;
    }
  }
}

// =============================================================================
// Materials — Materialbestand + Bewegungen
// =============================================================================

type DemoMaterialMovement =
  | { kind: 'receipt'; qty: number; daysAgo: number; unitCost?: number; note?: string }
  | {
      kind: 'issue';
      qty: number;
      daysAgo: number;
      propertyName?: string;
      assignRole?: 'hausmeister' | 'disponent';
      note?: string;
    }
  | {
      kind: 'adjustment';
      qty: number;
      daysAgo: number;
      direction: 'increase' | 'decrease';
      note?: string;
    }
  | { kind: 'write_off'; qty: number; daysAgo: number; note?: string };

type DemoMaterial = {
  label: string;
  sku?: string;
  category:
    | 'cleaning'
    | 'hardware'
    | 'safety'
    | 'electric'
    | 'plumbing'
    | 'paint'
    | 'garden'
    | 'winter'
    | 'office'
    | 'consumable'
    | 'other';
  unit: string;
  minStock: number;
  unitCost?: number;
  storageLocation?: string;
  supplier?: string;
  notes?: string;
  movements: DemoMaterialMovement[];
};

const DEMO_MATERIALS: DemoMaterial[] = [
  {
    label: 'Universalschraube M6×20',
    sku: 'HW-M6-20',
    category: 'hardware',
    unit: 'Stk',
    minStock: 200,
    unitCost: 0.08,
    storageLocation: 'Regal A2 · Fach 3',
    supplier: 'Würth',
    movements: [
      { kind: 'receipt', qty: 500, daysAgo: 60, unitCost: 0.08, note: 'Sammelbestellung' },
      { kind: 'issue', qty: 50, daysAgo: 30, propertyName: 'Wohnpark Rheinaue', assignRole: 'hausmeister' },
      { kind: 'issue', qty: 30, daysAgo: 10, propertyName: 'Bürocenter Königsallee 42' },
    ],
  },
  {
    label: 'LED-Glühlampe E27 · 8W · warmweiß',
    sku: 'EL-LED-E27-8',
    category: 'electric',
    unit: 'Stk',
    minStock: 20,
    unitCost: 3.9,
    storageLocation: 'Regal B1 · Fach 1',
    supplier: 'Osram',
    notes: 'Ersatz für alte Halogen 60W.',
    movements: [
      { kind: 'receipt', qty: 50, daysAgo: 45, unitCost: 3.9 },
      { kind: 'issue', qty: 15, daysAgo: 20, propertyName: 'Wohnpark Rheinaue', assignRole: 'hausmeister', note: 'Treppenhauslampen erneuert' },
      { kind: 'issue', qty: 20, daysAgo: 5, propertyName: 'Bürocenter Königsallee 42', assignRole: 'hausmeister' },
    ],
  },
  {
    label: 'Streusalz 25kg-Sack',
    sku: 'WT-SALT-25',
    category: 'winter',
    unit: 'Sack',
    minStock: 10,
    unitCost: 8.5,
    storageLocation: 'Halle · Palette 1',
    supplier: 'Salzland GmbH',
    movements: [
      { kind: 'receipt', qty: 40, daysAgo: 120, unitCost: 8.5, note: 'Wintervorrat' },
      { kind: 'issue', qty: 8, daysAgo: 30, propertyName: 'Villa am See', assignRole: 'hausmeister', note: 'Erster Streu-Einsatz' },
    ],
  },
  {
    label: 'Mikrofaser-Reinigungstuch',
    sku: 'CL-MIC-01',
    category: 'cleaning',
    unit: 'Stk',
    minStock: 100,
    unitCost: 0.65,
    storageLocation: 'Reinigungsschrank R1',
    supplier: 'CleanCorp',
    movements: [
      { kind: 'receipt', qty: 500, daysAgo: 90, unitCost: 0.6 },
      { kind: 'issue', qty: 120, daysAgo: 60, propertyName: 'Bürocenter Königsallee 42', note: 'Grundreinigung' },
      { kind: 'issue', qty: 90, daysAgo: 20, propertyName: 'Wohnpark Rheinaue' },
    ],
  },
  {
    label: 'Arbeitshandschuhe Größe L',
    sku: 'SF-GLV-L',
    category: 'safety',
    unit: 'Paar',
    minStock: 20,
    unitCost: 2.4,
    storageLocation: 'PSA-Schrank',
    supplier: 'Engelbert Strauss',
    movements: [
      { kind: 'receipt', qty: 60, daysAgo: 50, unitCost: 2.4 },
      { kind: 'issue', qty: 5, daysAgo: 12, assignRole: 'hausmeister', note: 'Persönliche Ausgabe' },
    ],
  },
  {
    label: 'Wischmop-Aufsatz 40cm',
    sku: 'CL-MOP-40',
    category: 'cleaning',
    unit: 'Stk',
    minStock: 5,
    unitCost: 6.9,
    storageLocation: 'Reinigungsschrank R1',
    movements: [
      { kind: 'receipt', qty: 10, daysAgo: 80, unitCost: 6.9 },
      { kind: 'issue', qty: 8, daysAgo: 15, propertyName: 'Bürocenter Königsallee 42', note: 'Ersatz nach Verschleiß' },
    ],
  },
  {
    label: 'Kabelschelle 12 mm',
    sku: 'EL-CS-12',
    category: 'electric',
    unit: 'Stk',
    minStock: 100,
    unitCost: 0.11,
    storageLocation: 'Regal B1 · Fach 4',
    movements: [
      { kind: 'receipt', qty: 300, daysAgo: 30, unitCost: 0.11 },
    ],
  },
  {
    label: 'Notfall-Streugut 25kg',
    sku: 'WT-SAND-25',
    category: 'winter',
    unit: 'Sack',
    minStock: 20,
    unitCost: 6.2,
    storageLocation: 'Halle · Palette 2',
    movements: [
      { kind: 'receipt', qty: 30, daysAgo: 100, unitCost: 6.2 },
      { kind: 'adjustment', qty: 5, daysAgo: 20, direction: 'decrease', note: 'Inventurdifferenz — Feuchteschaden' },
    ],
  },
];

function signedQty(m: DemoMaterialMovement): number {
  switch (m.kind) {
    case 'receipt':
      return m.qty;
    case 'issue':
    case 'write_off':
      return -m.qty;
    case 'adjustment':
      return m.direction === 'decrease' ? -m.qty : m.qty;
  }
}

async function ensureMaterials(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
  employeesByRole: EmployeesByRole,
) {
  for (const spec of DEMO_MATERIALS) {
    // Idempotent per (tenant_id, label) — kein property scope hier.
    const existing = await supabase
      .from('materials')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('label', spec.label)
      .is('deleted_at', null)
      .maybeSingle();

    let materialId: string;
    if (existing.data) {
      materialId = existing.data.id;
    } else {
      const inserted = await supabase
        .from('materials')
        .insert({
          tenant_id: tenantId,
          label: spec.label,
          sku: spec.sku ?? null,
          category: spec.category,
          unit: spec.unit,
          min_stock: spec.minStock,
          unit_cost: spec.unitCost ?? null,
          storage_location: spec.storageLocation ?? null,
          supplier: spec.supplier ?? null,
          notes: spec.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw inserted.error;
      materialId = inserted.data.id;
    }

    // Nur seeden wenn noch keine Bewegungen vorhanden sind.
    const existingMoves = await supabase
      .from('stock_movements')
      .select('id')
      .eq('material_id', materialId)
      .limit(1);
    if ((existingMoves.data?.length ?? 0) > 0) continue;

    // Chronologisch anlegen (älteste zuerst).
    const sorted = [...spec.movements].sort((a, b) => b.daysAgo - a.daysAgo);
    for (const mv of sorted) {
      const occurredAt = new Date(Date.now() - mv.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      const propertyId =
        mv.kind === 'issue' && mv.propertyName
          ? propertyIdByName.get(mv.propertyName) ?? null
          : null;
      const assigneeUserId =
        mv.kind === 'issue' && mv.assignRole
          ? employeesByRole[mv.assignRole].userId
          : null;
      const unitCost =
        mv.kind === 'receipt' && mv.unitCost !== undefined ? mv.unitCost : null;

      const res = await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        material_id: materialId,
        kind: mv.kind,
        quantity: signedQty(mv),
        unit_cost_at_time: unitCost,
        property_id: propertyId,
        assignee_user_id: assigneeUserId,
        occurred_at: occurredAt,
        note: mv.note ?? null,
        created_by: actorId,
      });
      if (res.error) throw res.error;
    }
  }
}

// =============================================================================
// Vehicles — Fuhrpark + Ereignis-Historie
// =============================================================================

type DemoVehicleEvent = {
  kind:
    | 'tuev'
    | 'service'
    | 'tire_change'
    | 'repair'
    | 'refuel'
    | 'mileage_reading'
    | 'insurance_renewal'
    | 'other';
  daysAgo: number;
  mileageKm?: number;
  costEur?: number;
  vendor?: string;
  note?: string;
};

type DemoVehicle = {
  licensePlate: string;
  make: string;
  model: string;
  vehicleType: 'car' | 'van' | 'truck' | 'pickup' | 'trailer' | 'machinery' | 'other';
  fuelType: 'petrol' | 'diesel' | 'electric' | 'hybrid' | 'lpg' | 'other';
  year?: number;
  vin?: string;
  mileageKm?: number;
  driverRole?: 'hausmeister' | 'disponent';
  nextTuevAtInDays?: number;
  nextServiceAtInDays?: number;
  nextServiceDueKm?: number;
  insuranceExpiresInDays?: number;
  storageLocation?: string;
  notes?: string;
  events: DemoVehicleEvent[];
};

const DEMO_VEHICLES: DemoVehicle[] = [
  {
    licensePlate: 'DÜ-HM 100',
    make: 'VW',
    model: 'Caddy Cargo',
    vehicleType: 'van',
    fuelType: 'diesel',
    year: 2022,
    vin: 'WV1ZZZ2KZNH123456',
    mileageKm: 48250,
    driverRole: 'hausmeister',
    nextTuevAtInDays: 45,
    nextServiceAtInDays: 120,
    nextServiceDueKm: 60000,
    insuranceExpiresInDays: 200,
    storageLocation: 'Hof 1 · Platz 3',
    events: [
      { kind: 'service', daysAgo: 210, mileageKm: 30500, costEur: 342.9, vendor: 'VW Autohaus Meier', note: 'Ölwechsel + Filter' },
      { kind: 'tuev', daysAgo: 90, mileageKm: 42000, costEur: 128, vendor: 'TÜV Rheinland' },
      { kind: 'refuel', daysAgo: 12, mileageKm: 47980, costEur: 74.5, vendor: 'Aral' },
      { kind: 'mileage_reading', daysAgo: 2, mileageKm: 48250 },
    ],
  },
  {
    licensePlate: 'DÜ-HM 200',
    make: 'Mercedes-Benz',
    model: 'Sprinter 316 CDI',
    vehicleType: 'truck',
    fuelType: 'diesel',
    year: 2020,
    mileageKm: 132400,
    driverRole: 'disponent',
    nextTuevAtInDays: -5,
    nextServiceAtInDays: 30,
    nextServiceDueKm: 135000,
    insuranceExpiresInDays: 150,
    storageLocation: 'Halle B',
    notes: 'TÜV überfällig — Termin blockiert.',
    events: [
      { kind: 'service', daysAgo: 180, mileageKm: 122000, costEur: 512.4, vendor: 'MB Service Center' },
      { kind: 'tire_change', daysAgo: 200, mileageKm: 121500, costEur: 640, vendor: 'Reifen König', note: 'Winter → Sommer' },
      { kind: 'repair', daysAgo: 60, mileageKm: 128200, costEur: 1240, vendor: 'MB Service Center', note: 'Anlasser getauscht' },
      { kind: 'mileage_reading', daysAgo: 1, mileageKm: 132400 },
    ],
  },
  {
    licensePlate: 'DÜ-HM 300',
    make: 'Fiat',
    model: 'Ducato',
    vehicleType: 'van',
    fuelType: 'diesel',
    year: 2019,
    mileageKm: 89200,
    nextTuevAtInDays: 380,
    nextServiceAtInDays: 90,
    insuranceExpiresInDays: 40,
    events: [
      { kind: 'tuev', daysAgo: 10, mileageKm: 88900, costEur: 118, vendor: 'DEKRA' },
      { kind: 'service', daysAgo: 60, mileageKm: 86400, costEur: 380, vendor: 'Fiat Werkstatt Rhein' },
    ],
  },
  {
    licensePlate: 'DÜ-HM 400',
    make: 'Humbaur',
    model: 'HN 132513',
    vehicleType: 'trailer',
    fuelType: 'other',
    year: 2021,
    nextTuevAtInDays: 260,
    insuranceExpiresInDays: 300,
    storageLocation: 'Hof 2',
    notes: 'Ungebremster Anhänger 750 kg zGG.',
    events: [
      { kind: 'tuev', daysAgo: 100, costEur: 62, vendor: 'DEKRA' },
    ],
  },
  {
    licensePlate: 'DÜ-HM 500',
    make: 'Stihl',
    model: 'MS 261',
    vehicleType: 'machinery',
    fuelType: 'petrol',
    year: 2023,
    driverRole: 'hausmeister',
    nextServiceAtInDays: 10,
    storageLocation: 'Werkstatt Regal S3',
    notes: 'Motorsäge — jährliche Wartung.',
    events: [
      { kind: 'service', daysAgo: 355, costEur: 89, vendor: 'Stihl Fachhandel', note: 'Kettenölung, Schwertwechsel' },
    ],
  },
];

function offsetIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function ensureVehicles(
  tenantId: string,
  actorId: string,
  employeesByRole: EmployeesByRole,
) {
  for (const spec of DEMO_VEHICLES) {
    const existing = await supabase
      .from('vehicles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('license_plate', spec.licensePlate)
      .is('deleted_at', null)
      .maybeSingle();

    let vehicleId: string;
    if (existing.data) {
      vehicleId = existing.data.id;
    } else {
      const driverId = spec.driverRole ? employeesByRole[spec.driverRole].userId : null;
      const inserted = await supabase
        .from('vehicles')
        .insert({
          tenant_id: tenantId,
          license_plate: spec.licensePlate,
          make: spec.make,
          model: spec.model,
          vehicle_type: spec.vehicleType,
          fuel_type: spec.fuelType,
          year: spec.year ?? null,
          vin: spec.vin ?? null,
          mileage_km: spec.mileageKm ?? null,
          primary_driver_user_id: driverId,
          next_tuev_at: spec.nextTuevAtInDays !== undefined ? offsetIsoDate(spec.nextTuevAtInDays) : null,
          next_service_at: spec.nextServiceAtInDays !== undefined ? offsetIsoDate(spec.nextServiceAtInDays) : null,
          next_service_due_km: spec.nextServiceDueKm ?? null,
          insurance_expires_at:
            spec.insuranceExpiresInDays !== undefined ? offsetIsoDate(spec.insuranceExpiresInDays) : null,
          storage_location: spec.storageLocation ?? null,
          notes: spec.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw inserted.error;
      vehicleId = inserted.data.id;
    }

    const existingEvents = await supabase
      .from('vehicle_events')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .limit(1);
    if ((existingEvents.data?.length ?? 0) > 0) continue;

    const sorted = [...spec.events].sort((a, b) => b.daysAgo - a.daysAgo);
    for (const ev of sorted) {
      const res = await supabase.from('vehicle_events').insert({
        tenant_id: tenantId,
        vehicle_id: vehicleId,
        kind: ev.kind,
        event_date: offsetIsoDate(-ev.daysAgo),
        mileage_km: ev.mileageKm ?? null,
        cost_eur: ev.costEur ?? null,
        vendor: ev.vendor ?? null,
        note: ev.note ?? null,
        created_by: actorId,
      });
      if (res.error) throw res.error;
    }
  }
}

// =============================================================================
// Tours — Multi-Stopp-Tourenplanung
// =============================================================================

type DemoTourStop = {
  propertyName?: string;
  label: string;
  plannedArrivalOffsetMin?: number; // Minuten nach dem Start der Tour
  durationMinutes?: number;
  status?: 'pending' | 'arrived' | 'completed' | 'skipped';
  note?: string;
};

type DemoTour = {
  title: string;
  dateOffsetDays: number; // 0 = heute, 1 = morgen, -1 = gestern
  startHour: number; // 24h
  status: 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
  driverRole?: 'hausmeister' | 'disponent';
  vehiclePlate?: string;
  notes?: string;
  stops: DemoTourStop[];
};

const DEMO_TOURS: DemoTour[] = [
  {
    title: 'Rundgang Nord — KW-Kontrollen',
    dateOffsetDays: -1,
    startHour: 7,
    status: 'completed',
    driverRole: 'hausmeister',
    vehiclePlate: 'DÜ-HM 100',
    notes: 'Wöchentlicher Sichtkontrolle-Rundgang.',
    stops: [
      { propertyName: 'Wohnpark Rheinaue', label: 'Wohnpark Rheinaue', plannedArrivalOffsetMin: 0, durationMinutes: 45, status: 'completed', note: 'Aufzug OK, Keller trocken.' },
      { propertyName: 'Bürohaus Meckenheim', label: 'Bürohaus Meckenheim', plannedArrivalOffsetMin: 60, durationMinutes: 30, status: 'completed' },
      { propertyName: 'Reihenhaus-Anlage Bad Godesberg', label: 'Reihenhaus-Anlage Bad Godesberg', plannedArrivalOffsetMin: 105, durationMinutes: 30, status: 'completed' },
    ],
  },
  {
    title: 'Laufende Aufträge Mitte',
    dateOffsetDays: 0,
    startHour: 8,
    status: 'in_progress',
    driverRole: 'hausmeister',
    vehiclePlate: 'DÜ-HM 300',
    stops: [
      { propertyName: 'Wohnpark Rheinaue', label: 'Wohnpark Rheinaue · Aufzug', plannedArrivalOffsetMin: 0, durationMinutes: 60, status: 'completed', note: 'Wartung Aufzug Haus 1.' },
      { label: 'Materiallager (Zwischenstopp)', plannedArrivalOffsetMin: 75, durationMinutes: 15, status: 'completed', note: 'Filter tauschen.' },
      { propertyName: 'Bürohaus Meckenheim', label: 'Bürohaus Meckenheim · Beleuchtung', plannedArrivalOffsetMin: 105, durationMinutes: 45, status: 'arrived' },
      { propertyName: 'Reihenhaus-Anlage Bad Godesberg', label: 'Reihenhaus-Anlage Bad Godesberg · Gartenpflege', plannedArrivalOffsetMin: 165, durationMinutes: 90, status: 'pending' },
    ],
  },
  {
    title: 'Winterdienst Vorbereitung',
    dateOffsetDays: 2,
    startHour: 6,
    status: 'planned',
    driverRole: 'disponent',
    vehiclePlate: 'DÜ-HM 200',
    notes: 'Streugut aufnehmen, Räumpläne verteilen.',
    stops: [
      { label: 'Baustoffhandel Wesseling', plannedArrivalOffsetMin: 0, durationMinutes: 30, note: 'Streusalz 500 kg abholen.' },
      { propertyName: 'Wohnpark Rheinaue', label: 'Wohnpark Rheinaue', plannedArrivalOffsetMin: 60, durationMinutes: 45 },
      { propertyName: 'Bürohaus Meckenheim', label: 'Bürohaus Meckenheim', plannedArrivalOffsetMin: 120, durationMinutes: 30 },
    ],
  },
  {
    title: 'Ablesungen Q4',
    dateOffsetDays: 3,
    startHour: 9,
    status: 'draft',
    driverRole: 'hausmeister',
    stops: [
      { propertyName: 'Wohnpark Rheinaue', label: 'Wohnpark Rheinaue · Zählerablesung', durationMinutes: 60 },
      { propertyName: 'Bürohaus Meckenheim', label: 'Bürohaus Meckenheim · Zählerablesung', durationMinutes: 40 },
    ],
  },
];

function offsetIsoTimestamp(dateOffsetDays: number, hour: number, minute: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dateOffsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function ensureTours(
  tenantId: string,
  actorId: string,
  propertyIdByName: Map<string, string>,
  employeesByRole: EmployeesByRole,
) {
  for (const spec of DEMO_TOURS) {
    const tourDate = offsetIsoDate(spec.dateOffsetDays);
    const existing = await supabase
      .from('tours')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('title', spec.title)
      .eq('planned_date', tourDate)
      .is('deleted_at', null)
      .maybeSingle();

    let tourId: string;
    if (existing.data) {
      tourId = existing.data.id;
    } else {
      const driverId = spec.driverRole ? employeesByRole[spec.driverRole].userId : null;
      let vehicleId: string | null = null;
      if (spec.vehiclePlate) {
        const veh = await supabase
          .from('vehicles')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('license_plate', spec.vehiclePlate)
          .is('deleted_at', null)
          .maybeSingle();
        vehicleId = veh.data?.id ?? null;
      }

      const started =
        spec.status === 'in_progress' || spec.status === 'completed'
          ? offsetIsoTimestamp(spec.dateOffsetDays, spec.startHour)
          : null;
      const completed =
        spec.status === 'completed'
          ? offsetIsoTimestamp(spec.dateOffsetDays, spec.startHour + 4)
          : null;

      const inserted = await supabase
        .from('tours')
        .insert({
          tenant_id: tenantId,
          title: spec.title,
          planned_date: tourDate,
          driver_user_id: driverId,
          vehicle_id: vehicleId,
          status: spec.status,
          started_at: started,
          completed_at: completed,
          notes: spec.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw inserted.error;
      tourId = inserted.data.id;
    }

    const existingStops = await supabase
      .from('tour_stops')
      .select('id')
      .eq('tour_id', tourId)
      .limit(1);
    if ((existingStops.data?.length ?? 0) > 0) continue;

    let seq = 1;
    for (const s of spec.stops) {
      const propertyId = s.propertyName ? propertyIdByName.get(s.propertyName) ?? null : null;
      const plannedArrival =
        s.plannedArrivalOffsetMin !== undefined
          ? offsetIsoTimestamp(spec.dateOffsetDays, spec.startHour, s.plannedArrivalOffsetMin)
          : null;
      const plannedDeparture =
        plannedArrival && s.durationMinutes !== undefined
          ? new Date(new Date(plannedArrival).getTime() + s.durationMinutes * 60_000).toISOString()
          : null;

      const status = s.status ?? 'pending';
      const actualArrival =
        status === 'arrived' || status === 'completed' ? plannedArrival : null;
      const actualDeparture = status === 'completed' ? plannedDeparture : null;

      const res = await supabase.from('tour_stops').insert({
        tenant_id: tenantId,
        tour_id: tourId,
        sequence: seq,
        property_id: propertyId,
        label: s.label,
        planned_arrival_at: plannedArrival,
        planned_departure_at: plannedDeparture,
        actual_arrival_at: actualArrival,
        actual_departure_at: actualDeparture,
        status,
        duration_minutes: s.durationMinutes ?? null,
        note: s.note ?? null,
        created_by: actorId,
        updated_by: actorId,
      });
      if (res.error) throw res.error;
      seq++;
    }
  }
}

// =============================================================================
// Messaging — Thread-basierte interne Nachrichten
// =============================================================================

type DemoMessage = {
  authorRole: 'owner' | 'disponent' | 'hausmeister';
  body: string;
  hoursAgo: number;
};

type DemoMessageThread = {
  subject: string;
  creatorRole: 'owner' | 'disponent' | 'hausmeister';
  participants: Array<'owner' | 'disponent' | 'hausmeister'>;
  markReadFor: Array<'owner' | 'disponent' | 'hausmeister'>; // wer hat schon alles gelesen
  messages: DemoMessage[];
};

const DEMO_MESSAGE_THREADS: DemoMessageThread[] = [
  {
    subject: 'Aufzug Wohnpark Rheinaue — Wartung diese Woche',
    creatorRole: 'disponent',
    participants: ['disponent', 'hausmeister', 'owner'],
    markReadFor: ['disponent', 'owner'],
    messages: [
      { authorRole: 'disponent', hoursAgo: 48, body: 'Hallo Thomas, kannst du die Aufzug-Wartung im Rheinaue am Mittwoch übernehmen? Techniker kommt um 09:00.' },
      { authorRole: 'hausmeister', hoursAgo: 47, body: 'Ja klar. Ich bin um 08:45 vor Ort und öffne den Maschinenraum.' },
      { authorRole: 'disponent', hoursAgo: 46, body: 'Danke! Der Techniker meldet sich telefonisch, falls er früher da ist.' },
      { authorRole: 'hausmeister', hoursAgo: 3, body: 'Wartung ist erledigt, Bericht folgt heute Nachmittag.' },
    ],
  },
  {
    subject: 'Streusalz-Bestellung Q4',
    creatorRole: 'owner',
    participants: ['owner', 'disponent'],
    markReadFor: ['owner', 'disponent'],
    messages: [
      { authorRole: 'owner', hoursAgo: 168, body: 'Sabine, bitte bestell für den Winterdienst 500 kg Streusalz beim Baustoffhandel Wesseling.' },
      { authorRole: 'disponent', hoursAgo: 165, body: 'Bestellt — Abholung ist für nächste Woche Dienstag eingeplant. Kosten: 210 EUR netto.' },
      { authorRole: 'owner', hoursAgo: 160, body: 'Perfekt, danke.' },
    ],
  },
  {
    subject: 'Materialbestellung — Filter für Sprinter',
    creatorRole: 'hausmeister',
    participants: ['hausmeister', 'disponent'],
    markReadFor: ['hausmeister'],
    messages: [
      { authorRole: 'hausmeister', hoursAgo: 20, body: 'Sabine, der Sprinter braucht demnächst neue Luft- und Ölfilter. Kann ich die bestellen?' },
      { authorRole: 'disponent', hoursAgo: 2, body: 'Ja, geht direkt raus. Ich schicke dir die Bestell-Bestätigung, sobald sie da ist.' },
    ],
  },
  {
    subject: 'Meldung Bewohner — Heizkörper Rheinaue Haus 2',
    creatorRole: 'owner',
    participants: ['owner', 'hausmeister', 'disponent'],
    markReadFor: ['owner'],
    messages: [
      { authorRole: 'owner', hoursAgo: 6, body: 'Frau Müller aus Haus 2 (Wohnung 3B) meldet, dass ihr Heizkörper nicht mehr warm wird. Kann jemand heute noch vorbei?' },
      { authorRole: 'disponent', hoursAgo: 5, body: 'Thomas ist gerade in der Nähe — er schaut nach.' },
    ],
  },
];

async function ensureMessageThreads(
  tenantId: string,
  ownerUserId: string,
  employeesByRole: EmployeesByRole,
) {
  const userIdByRole: Record<'owner' | 'disponent' | 'hausmeister', string> = {
    owner: ownerUserId,
    disponent: employeesByRole.disponent.userId,
    hausmeister: employeesByRole.hausmeister.userId,
  };

  for (const spec of DEMO_MESSAGE_THREADS) {
    const creatorId = userIdByRole[spec.creatorRole];

    const existing = await supabase
      .from('message_threads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('subject', spec.subject)
      .eq('created_by', creatorId)
      .maybeSingle();

    let threadId: string;
    if (existing.data) {
      threadId = existing.data.id;
    } else {
      const inserted = await supabase
        .from('message_threads')
        .insert({
          tenant_id: tenantId,
          subject: spec.subject,
          created_by: creatorId,
          updated_by: creatorId,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw inserted.error;
      threadId = inserted.data.id;

      // Ersteller ist per Trigger schon Teilnehmer, weitere hinzufügen
      const extras = spec.participants
        .filter((role) => role !== spec.creatorRole)
        .map((role) => ({
          tenant_id: tenantId,
          thread_id: threadId,
          user_id: userIdByRole[role],
          added_by: creatorId,
        }));
      if (extras.length > 0) {
        const partRes = await supabase.from('message_thread_participants').insert(extras);
        if (partRes.error) throw partRes.error;
      }
    }

    const existingMsgs = await supabase
      .from('messages')
      .select('id')
      .eq('thread_id', threadId)
      .limit(1);
    if ((existingMsgs.data?.length ?? 0) > 0) continue;

    const sorted = [...spec.messages].sort((a, b) => b.hoursAgo - a.hoursAgo);
    for (const msg of sorted) {
      const sentAt = new Date(Date.now() - msg.hoursAgo * 3600_000).toISOString();
      const res = await supabase.from('messages').insert({
        tenant_id: tenantId,
        thread_id: threadId,
        author_user_id: userIdByRole[msg.authorRole],
        body: msg.body,
        sent_at: sentAt,
      });
      if (res.error) throw res.error;
    }

    // last_read_at für alle Teilnehmer setzen, die "schon gelesen haben"
    const nowIso = new Date().toISOString();
    for (const role of spec.markReadFor) {
      const upd = await supabase
        .from('message_thread_participants')
        .update({ last_read_at: nowIso })
        .eq('thread_id', threadId)
        .eq('user_id', userIdByRole[role]);
      if (upd.error) throw upd.error;
    }
  }
}

// ============================================================================
// Announcements
// ============================================================================

type DemoAnnouncement = {
  title: string;
  body: string;
  status: 'draft' | 'published' | 'closed';
  creatorRole: 'owner' | 'disponent' | 'hausmeister';
  target: { type: 'all' } | { type: 'role'; roleKey: string } | { type: 'users'; users: Array<'owner' | 'disponent' | 'hausmeister'> };
  requiresAcknowledgement: boolean;
  publishedHoursAgo?: number;
  expiresInHours?: number;
  ackFrom?: Array<'owner' | 'disponent' | 'hausmeister'>;
  readFrom?: Array<'owner' | 'disponent' | 'hausmeister'>;
};

const DEMO_ANNOUNCEMENTS: DemoAnnouncement[] = [
  {
    title: 'Team-Meeting am Freitag 10:00',
    body: 'Wir treffen uns Freitag um 10:00 im Büro zur Wochenbesprechung. Bitte alle aktiven Aufträge und offenen Meldungen mitbringen. Dauer ca. 45 Minuten.',
    status: 'published',
    creatorRole: 'owner',
    target: { type: 'all' },
    requiresAcknowledgement: true,
    publishedHoursAgo: 20,
    expiresInHours: 96,
    ackFrom: ['disponent'],
    readFrom: ['disponent', 'hausmeister'],
  },
  {
    title: 'Neue Winter-Route für Hausmeister',
    body: 'Ab kommender Woche gibt es eine neue Reihenfolge für die Winter-Kontrollen. Details liegen im Aufenthaltsraum aus. Bei Fragen bitte Rücksprache mit Frau Meyer.',
    status: 'published',
    creatorRole: 'disponent',
    target: { type: 'role', roleKey: 'hausmeister' },
    requiresAcknowledgement: true,
    publishedHoursAgo: 6,
    ackFrom: [],
    readFrom: ['hausmeister'],
  },
  {
    title: 'Zeitkonten-Check bis 31.',
    body: 'Bitte alle offenen Zeit-Einträge bis Monatsende prüfen und ggfs. korrigieren. Der Payroll-Cutoff ist der 1. jeden Monats.',
    status: 'published',
    creatorRole: 'owner',
    target: { type: 'users', users: ['disponent', 'hausmeister'] },
    requiresAcknowledgement: false,
    publishedHoursAgo: 48,
    readFrom: ['disponent'],
  },
  {
    title: 'Entwurf: Sommerurlaub-Regelung',
    body: 'Entwurf für die Urlaubsplanung: Anträge bitte bis Ende März stellen. Details folgen nach Freigabe durch die Geschäftsleitung.',
    status: 'draft',
    creatorRole: 'owner',
    target: { type: 'all' },
    requiresAcknowledgement: false,
  },
];

async function ensureAnnouncements(
  tenantId: string,
  ownerUserId: string,
  employeesByRole: EmployeesByRole,
) {
  const userIdByRole: Record<'owner' | 'disponent' | 'hausmeister', string> = {
    owner: ownerUserId,
    disponent: employeesByRole.disponent.userId,
    hausmeister: employeesByRole.hausmeister.userId,
  };

  for (const spec of DEMO_ANNOUNCEMENTS) {
    const creatorId = userIdByRole[spec.creatorRole];

    const existing = await supabase
      .from('announcements')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('title', spec.title)
      .eq('created_by', creatorId)
      .maybeSingle();

    let annId: string;
    if (existing.data) {
      annId = existing.data.id;
    } else {
      const publishedAt =
        spec.status !== 'draft' && spec.publishedHoursAgo !== undefined
          ? new Date(Date.now() - spec.publishedHoursAgo * 3600_000).toISOString()
          : null;
      const expiresAt =
        publishedAt && spec.expiresInHours !== undefined
          ? new Date(new Date(publishedAt).getTime() + spec.expiresInHours * 3600_000).toISOString()
          : null;

      const insert = await supabase
        .from('announcements')
        .insert({
          tenant_id: tenantId,
          title: spec.title,
          body: spec.body,
          status: spec.status,
          target_type: spec.target.type,
          target_role_key: spec.target.type === 'role' ? spec.target.roleKey : null,
          target_user_ids:
            spec.target.type === 'users'
              ? spec.target.users.map((r) => userIdByRole[r])
              : null,
          requires_acknowledgement: spec.requiresAcknowledgement,
          published_at: publishedAt,
          expires_at: expiresAt,
          created_by: creatorId,
        })
        .select('id')
        .single();
      if (insert.error || !insert.data) throw insert.error;
      annId = insert.data.id;
    }

    // Read/Ack receipts
    const nowIso = new Date().toISOString();
    for (const role of spec.readFrom ?? []) {
      await supabase.from('announcement_receipts').upsert(
        {
          announcement_id: annId,
          user_id: userIdByRole[role],
          read_at: nowIso,
        },
        { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
      );
    }
    for (const role of spec.ackFrom ?? []) {
      await supabase.from('announcement_receipts').upsert(
        {
          announcement_id: annId,
          user_id: userIdByRole[role],
          read_at: nowIso,
          acknowledged_at: nowIso,
        },
        { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
      );
    }
  }
}

// ============================================================================
// Billing: Angebote + Rechnungen
// ============================================================================

type DemoLineItem = {
  description: string;
  quantity: number;
  unit?: string;
  unit_price_cents: number;
  tax_rate: number;
};

type DemoOffer = {
  title: string;
  description?: string;
  billToName: string;
  billToAddress: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  propertyName?: string;
  issuedDaysAgo?: number;
  validForDays?: number;
  notes?: string;
  items: DemoLineItem[];
};

type DemoInvoice = {
  title: string;
  description?: string;
  billToName: string;
  billToAddress: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  propertyName?: string;
  issuedDaysAgo?: number;
  paymentTermDays?: number;
  paidDaysAgo?: number;
  notes?: string;
  items: DemoLineItem[];
};

const DEMO_BILLING_OFFERS: DemoOffer[] = [
  {
    title: 'Winterdienst-Saison 2026/27',
    description: 'Pauschalpreis für Räum- und Streudienst November bis März, Wochenend-Bereitschaft inklusive.',
    billToName: 'Hausverwaltung Müller GmbH',
    billToAddress: 'Königsallee 42\n40212 Düsseldorf',
    status: 'sent',
    propertyName: 'Musterstraße 5',
    issuedDaysAgo: 4,
    validForDays: 30,
    items: [
      { description: 'Winterdienst Pauschale Saison', quantity: 1, unit: 'Pauschale', unit_price_cents: 320000, tax_rate: 19 },
      { description: 'Streugut (10 Sack á 25 kg)', quantity: 10, unit: 'Sack', unit_price_cents: 1250, tax_rate: 19 },
    ],
  },
  {
    title: 'Notdienst Aufzug — Reparatur Tragseile',
    description: 'Austausch der Tragseile, Sicherheitsprüfung nach TRA/BetrSichV.',
    billToName: 'WEG Rosenweg 12',
    billToAddress: 'c/o Immobilien Schmidt\nRosenweg 12\n50667 Köln',
    status: 'accepted',
    propertyName: 'Rosenweg 12',
    issuedDaysAgo: 15,
    validForDays: 21,
    items: [
      { description: 'Anfahrt Notdienst', quantity: 1, unit: 'Std.', unit_price_cents: 15000, tax_rate: 19 },
      { description: 'Tragseil-Satz mit Prüfung', quantity: 1, unit: 'Stk.', unit_price_cents: 240000, tax_rate: 19 },
      { description: 'Monteur-Stunden', quantity: 8, unit: 'Std.', unit_price_cents: 8500, tax_rate: 19 },
    ],
  },
  {
    title: 'Grünanlagenpflege Frühling',
    description: 'Rasenmahd, Heckenschnitt, Baumkontrollen.',
    billToName: 'Beispiel Immobilien AG',
    billToAddress: 'Bahnhofstr. 100\n60329 Frankfurt am Main',
    status: 'draft',
    items: [
      { description: 'Rasenmahd inkl. Abfuhr', quantity: 12, unit: 'Std.', unit_price_cents: 5500, tax_rate: 19 },
      { description: 'Heckenschnitt', quantity: 6, unit: 'Std.', unit_price_cents: 5500, tax_rate: 19 },
    ],
  },
];

const DEMO_BILLING_INVOICES: DemoInvoice[] = [
  {
    title: 'Reparatur Wasserschaden Keller — Musterstraße 5',
    description: 'Trocknungsgerät-Miete und Handwerker-Stunden nach Wasserschaden.',
    billToName: 'Hausverwaltung Müller GmbH',
    billToAddress: 'Königsallee 42\n40212 Düsseldorf',
    status: 'paid',
    propertyName: 'Musterstraße 5',
    issuedDaysAgo: 22,
    paymentTermDays: 14,
    paidDaysAgo: 3,
    items: [
      { description: 'Trocknungsgeräte-Miete (7 Tage)', quantity: 7, unit: 'Tag', unit_price_cents: 4500, tax_rate: 19 },
      { description: 'Handwerker-Stunden (Beseitigung)', quantity: 6, unit: 'Std.', unit_price_cents: 6800, tax_rate: 19 },
      { description: 'Material (Farbe, Spachtel)', quantity: 1, unit: 'Pos.', unit_price_cents: 8900, tax_rate: 19 },
    ],
  },
  {
    title: 'Reinigung Treppenhaus Q1',
    billToName: 'WEG Rosenweg 12',
    billToAddress: 'c/o Immobilien Schmidt\nRosenweg 12\n50667 Köln',
    status: 'sent',
    propertyName: 'Rosenweg 12',
    issuedDaysAgo: 18,
    paymentTermDays: 14,
    items: [
      { description: 'Treppenhausreinigung wöchentlich (13 Wochen)', quantity: 13, unit: 'Woche', unit_price_cents: 7500, tax_rate: 19 },
    ],
    notes: 'Achtung: Fällig überschritten — Zahlungserinnerung ist raus.',
  },
  {
    title: 'Kleinreparatur Fassade',
    billToName: 'Beispiel Immobilien AG',
    billToAddress: 'Bahnhofstr. 100\n60329 Frankfurt am Main',
    status: 'sent',
    issuedDaysAgo: 5,
    paymentTermDays: 14,
    items: [
      { description: 'Fassaden-Ausbesserung', quantity: 3, unit: 'Std.', unit_price_cents: 6800, tax_rate: 19 },
      { description: 'Material', quantity: 1, unit: 'Pos.', unit_price_cents: 5400, tax_rate: 19 },
    ],
  },
  {
    title: 'Winterdienst November (Entwurf)',
    billToName: 'Hausverwaltung Müller GmbH',
    billToAddress: 'Königsallee 42\n40212 Düsseldorf',
    status: 'draft',
    propertyName: 'Musterstraße 5',
    items: [
      { description: 'Winterdienst-Einsätze November', quantity: 8, unit: 'Einsatz', unit_price_cents: 12500, tax_rate: 19 },
    ],
  },
];

function computeLineTotalsSeed(item: { quantity: number; unit_price_cents: number; tax_rate: number }) {
  const net = Math.round(item.quantity * item.unit_price_cents);
  const tax = Math.round((net * item.tax_rate) / 100);
  return { net_cents: net, tax_cents: tax, gross_cents: net + tax };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function ensureBillingDocuments(
  tenantId: string,
  ownerUserId: string,
  propertyIdByName: Map<string, string>,
) {
  for (const spec of DEMO_BILLING_OFFERS) {
    const existing = await supabase
      .from('offers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('title', spec.title)
      .maybeSingle();
    if (existing.data) continue;

    const issuedAt =
      spec.status !== 'draft' && spec.issuedDaysAgo !== undefined ? isoDaysAgo(spec.issuedDaysAgo) : null;
    const validUntil =
      issuedAt && spec.validForDays !== undefined
        ? isoDaysAhead(-spec.issuedDaysAgo! + spec.validForDays)
        : null;

    const items = spec.items.map((i) => ({ ...i, ...computeLineTotalsSeed(i) }));
    const totals = items.reduce(
      (acc, i) => ({
        net_total_cents: acc.net_total_cents + i.net_cents,
        tax_total_cents: acc.tax_total_cents + i.tax_cents,
        gross_total_cents: acc.gross_total_cents + i.gross_cents,
      }),
      { net_total_cents: 0, tax_total_cents: 0, gross_total_cents: 0 },
    );

    const insert = await supabase
      .from('offers')
      .insert({
        code: '',
        tenant_id: tenantId,
        status: spec.status,
        title: spec.title,
        description: spec.description ?? null,
        property_id: spec.propertyName ? propertyIdByName.get(spec.propertyName) ?? null : null,
        bill_to_name: spec.billToName,
        bill_to_address: spec.billToAddress,
        issued_at: issuedAt,
        valid_until: validUntil,
        notes: spec.notes ?? null,
        ...totals,
        created_by: ownerUserId,
        updated_by: ownerUserId,
      })
      .select('id')
      .single();
    if (insert.error || !insert.data) throw insert.error;
    const offerId = insert.data.id;

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]!;
      const r = await supabase.from('billing_line_items').insert({
        tenant_id: tenantId,
        document_kind: 'offer',
        offer_id: offerId,
        position: idx + 1,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit ?? null,
        unit_price_cents: it.unit_price_cents,
        tax_rate: it.tax_rate,
        net_cents: it.net_cents,
        tax_cents: it.tax_cents,
        gross_cents: it.gross_cents,
      });
      if (r.error) throw r.error;
    }
  }

  for (const spec of DEMO_BILLING_INVOICES) {
    const existing = await supabase
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('title', spec.title)
      .maybeSingle();
    if (existing.data) continue;

    const issuedAt =
      spec.status !== 'draft' && spec.issuedDaysAgo !== undefined ? isoDaysAgo(spec.issuedDaysAgo) : null;
    const dueAt =
      issuedAt && spec.paymentTermDays !== undefined ? isoDaysAhead(-spec.issuedDaysAgo! + spec.paymentTermDays) : null;
    const paidAt = spec.status === 'paid' && spec.paidDaysAgo !== undefined ? isoDaysAgo(spec.paidDaysAgo) : null;

    const items = spec.items.map((i) => ({ ...i, ...computeLineTotalsSeed(i) }));
    const totals = items.reduce(
      (acc, i) => ({
        net_total_cents: acc.net_total_cents + i.net_cents,
        tax_total_cents: acc.tax_total_cents + i.tax_cents,
        gross_total_cents: acc.gross_total_cents + i.gross_cents,
      }),
      { net_total_cents: 0, tax_total_cents: 0, gross_total_cents: 0 },
    );

    const insert = await supabase
      .from('invoices')
      .insert({
        code: '',
        tenant_id: tenantId,
        status: spec.status,
        title: spec.title,
        description: spec.description ?? null,
        property_id: spec.propertyName ? propertyIdByName.get(spec.propertyName) ?? null : null,
        bill_to_name: spec.billToName,
        bill_to_address: spec.billToAddress,
        issued_at: issuedAt,
        due_at: dueAt,
        paid_at: paidAt,
        notes: spec.notes ?? null,
        ...totals,
        created_by: ownerUserId,
        updated_by: ownerUserId,
      })
      .select('id')
      .single();
    if (insert.error || !insert.data) throw insert.error;
    const invoiceId = insert.data.id;

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]!;
      const r = await supabase.from('billing_line_items').insert({
        tenant_id: tenantId,
        document_kind: 'invoice',
        invoice_id: invoiceId,
        position: idx + 1,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit ?? null,
        unit_price_cents: it.unit_price_cents,
        tax_rate: it.tax_rate,
        net_cents: it.net_cents,
        tax_cents: it.tax_cents,
        gross_cents: it.gross_cents,
      });
      if (r.error) throw r.error;
    }
  }
}

async function ensureAutomationRules(tenantId: string, ownerUserId: string) {
  const rules = [
    {
      name: 'Erinnerung: überfällige Rechnung',
      description: 'Benachrichtigt den Owner sofort, sobald eine verschickte Rechnung ihr Zahlungsziel überschreitet.',
      trigger_key: 'invoice.overdue',
      trigger_config: {},
      action_key: 'notify_users',
      action_config: { user_ids: [ownerUserId] },
      enabled: true,
    },
    {
      name: 'Vorwarnung: Wartung fällig in 7 Tagen',
      description: 'Benachrichtigt den Owner, wenn ein Wartungsplan in einer Woche fällig wird.',
      trigger_key: 'maintenance.due_soon',
      trigger_config: { days_before: 7 },
      action_key: 'notify_users',
      action_config: { user_ids: [ownerUserId] },
      enabled: true,
    },
    {
      name: 'Neue Mängelmeldung → Owner benachrichtigen',
      description: 'Sobald eine neue Mängelmeldung eingeht, wird der Owner sofort per In-App-Notification informiert.',
      trigger_key: 'defect_report.created',
      trigger_config: {},
      action_key: 'notify_users',
      action_config: { user_ids: [ownerUserId] },
      enabled: true,
    },
    {
      name: 'Auftrag zugewiesen → Push an Mitarbeiter',
      description: 'Sobald ein Auftrag einem Mitarbeiter zugewiesen wird, bekommt genau diese Person eine In-App- und Push-Nachricht. Auch bei Wechsel der Zuweisung.',
      trigger_key: 'work_order.assigned',
      trigger_config: {},
      action_key: 'notify_assignee',
      action_config: {},
      enabled: true,
    },
    {
      name: 'Auftrag Statuswechsel → Owner benachrichtigen',
      description: 'Informiert den Owner, sobald ein Auftrag in In Arbeit, Blockiert, Erledigt oder Abgebrochen wechselt.',
      trigger_key: 'work_order.status_changed',
      trigger_config: {},
      action_key: 'notify_users',
      action_config: { user_ids: [ownerUserId] },
      enabled: true,
    },
    {
      name: 'Mängelmeldung Statuswechsel → Owner benachrichtigen',
      description: 'Informiert den Owner, sobald eine Mängelmeldung in Prüfung geht, in einen Auftrag umgewandelt oder abgelehnt wird.',
      trigger_key: 'defect_report.status_changed',
      trigger_config: {},
      action_key: 'notify_users',
      action_config: { user_ids: [ownerUserId] },
      enabled: true,
    },
  ];

  for (const rule of rules) {
    const existing = await supabase
      .from('automation_rules')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', rule.name)
      .maybeSingle();
    if (existing.data) continue;

    const r = await supabase.from('automation_rules').insert({
      tenant_id: tenantId,
      name: rule.name,
      description: rule.description,
      trigger_key: rule.trigger_key,
      trigger_config: rule.trigger_config as never,
      action_key: rule.action_key,
      action_config: rule.action_config as never,
      enabled: rule.enabled,
      created_by: ownerUserId,
      updated_by: ownerUserId,
    });
    if (r.error) throw r.error;
  }
}

main().catch((err) => {
  console.error('\nDemo-Seed fehlgeschlagen:', err);
  process.exit(1);
});
