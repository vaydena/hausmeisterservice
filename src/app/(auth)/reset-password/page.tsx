import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = {
  title: 'Passwort zurücksetzen',
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Passwort zurücksetzen</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort festlegen können.
        </p>
      </div>
      <ResetPasswordForm />
      <Link
        href="/login"
        className="text-sm text-[var(--color-primary)] hover:underline text-center"
      >
        Zurück zur Anmeldung
      </Link>
    </div>
  );
}
