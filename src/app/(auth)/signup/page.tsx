import type { Metadata } from 'next';
import { SignupForm, type PlanCode, type PlanInterval } from './signup-form';

export const metadata: Metadata = {
  title: 'Registrieren',
};

// Deep-Link-Parameter (?plan=&interval=) bewusst SERVER-seitig lesen und als
// Props reingeben. Frueher las SignupForm sie per useSearchParams(), was die
// ganze Maske ins Client-Rendering hinter einen <Suspense>-Fallback zwang —
// lud das JS nicht (langsames Netz, alter Chunk-Cache nach Deploy, Adblocker),
// sah ein Neukunde nur "Lädt …" statt eines Formulars. Server-gerendert ist
// das Formular sofort im HTML; die Interaktivitaet kommt bei Hydration oben
// drauf (Progressive Enhancement).
function parsePlan(value: string | string[] | undefined): PlanCode {
  return value === 'business' || value === 'enterprise' ? value : 'starter';
}

function parseInterval(value: string | string[] | undefined): PlanInterval {
  return value === 'yearly' ? 'yearly' : 'monthly';
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Unternehmen registrieren</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Legen Sie in wenigen Minuten Ihren eigenen Mandanten an. Nach
          Bestätigung Ihrer E-Mail-Adresse können Sie sofort loslegen.
        </p>
      </div>
      <SignupForm
        initialPlan={parsePlan(params.plan)}
        initialInterval={parseInterval(params.interval)}
      />
    </div>
  );
}
