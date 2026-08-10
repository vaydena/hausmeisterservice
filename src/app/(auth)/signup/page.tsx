import type { Metadata } from 'next';
import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Registrieren',
};

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Unternehmen registrieren</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Legen Sie in wenigen Minuten Ihren eigenen Mandanten an. Nach
          Bestätigung Ihrer E-Mail-Adresse können Sie sofort loslegen.
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
