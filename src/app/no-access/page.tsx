import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Loop-Breaker: authenticated User ohne Staff-Membership und ohne
// Resident-Datensatz landen hier statt in einer Endlosschleife zwischen
// /dashboard und /login. Ein unauthenticated User wird zurück zum Login
// gelotst (regulärer Weg).
export default async function NoAccessPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Ihr Konto ({user.email}) hat aktuell keine aktive Mandanten-Mitgliedschaft
          und ist keinem Bewohner-Profil zugeordnet.
        </p>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Bitte kontaktieren Sie Ihren Administrator, oder melden Sie sich ab,
          um es mit einem anderen Konto zu versuchen.
        </p>
      </div>
      <form action="/logout" method="post" className="flex flex-col gap-2">
        <button
          type="submit"
          className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          Abmelden
        </button>
      </form>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        <Link href="/impressum" className="underline hover:opacity-80">
          Impressum
        </Link>
        {' · '}
        <Link href="/datenschutz" className="underline hover:opacity-80">
          Datenschutz
        </Link>
      </p>
    </main>
  );
}
