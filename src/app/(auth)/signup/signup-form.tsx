'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { signupAction, type SignupState } from './actions';
import { slugify } from '@/lib/auth/signup-schema';

const INITIAL: SignupState = {};

const INPUT_CLS =
  'rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20';

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="text-xs text-[var(--color-destructive)]">
      {msg}
    </p>
  );
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, INITIAL);
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  // Solange der User das Slug-Feld nicht selbst editiert hat, wird es aus dem
  // Firmennamen generiert. Sobald er es anfässt, respektieren wir seine Eingabe.
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(companyName));
    }
  }, [companyName, slugTouched]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4 text-sm">
          <p className="font-medium">Fast geschafft.</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Wir haben eine Bestätigungs-E-Mail an <strong>{state.success.email}</strong>{' '}
            geschickt. Bitte den enthaltenen Link anklicken, um Ihr Konto zu aktivieren
            und Ihren Mandanten fertig einzurichten.
          </p>
        </div>
        <Link
          href="/login"
          className="text-sm text-[var(--color-primary)] hover:underline"
        >
          Zurück zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Firmenname</span>
        <input
          type="text"
          name="companyName"
          required
          autoComplete="organization"
          minLength={2}
          maxLength={100}
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          className={INPUT_CLS}
        />
        <FieldError msg={state.fieldErrors?.companyName} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Kürzel</span>
        <input
          type="text"
          name="slug"
          required
          minLength={2}
          maxLength={32}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value.toLowerCase());
            setSlugTouched(true);
          }}
          className={INPUT_CLS}
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Wird intern verwendet — nur Kleinbuchstaben, Zahlen und Bindestriche.
        </p>
        <FieldError msg={state.fieldErrors?.slug} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">E-Mail</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className={INPUT_CLS}
        />
        <FieldError msg={state.fieldErrors?.email} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Passwort</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="new-password"
          minLength={10}
          className={INPUT_CLS}
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Mindestens 10 Zeichen.
        </p>
        <FieldError msg={state.fieldErrors?.password} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Passwort bestätigen</span>
        <input
          type="password"
          name="passwordConfirm"
          required
          autoComplete="new-password"
          minLength={10}
          className={INPUT_CLS}
        />
        <FieldError msg={state.fieldErrors?.passwordConfirm} />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="termsAccepted" required className="mt-0.5" />
        <span>
          Ich akzeptiere die{' '}
          <Link href="/agb" target="_blank" className="text-[var(--color-primary)] hover:underline">
            AGB
          </Link>
          .
        </span>
      </label>
      <FieldError msg={state.fieldErrors?.termsAccepted} />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="privacyAccepted" required className="mt-0.5" />
        <span>
          Ich habe die{' '}
          <Link
            href="/datenschutz"
            target="_blank"
            className="text-[var(--color-primary)] hover:underline"
          >
            Datenschutzerklärung
          </Link>{' '}
          gelesen und stimme der Verarbeitung meiner Daten zu.
        </span>
      </label>
      <FieldError msg={state.fieldErrors?.privacyAccepted} />

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Registrieren …' : 'Registrieren'}
      </button>

      <div className="text-center text-sm">
        <Link href="/login" className="text-[var(--color-primary)] hover:underline">
          Bereits registriert? Anmelden
        </Link>
      </div>
    </form>
  );
}
