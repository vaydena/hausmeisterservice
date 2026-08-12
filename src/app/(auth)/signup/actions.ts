'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { clientEnv } from '@/lib/env';
import { signupSchema } from '@/lib/auth/signup-schema';

type SignupField =
  | 'companyName'
  | 'slug'
  | 'email'
  | 'password'
  | 'passwordConfirm'
  | 'termsAccepted'
  | 'privacyAccepted';

export type SignupState = {
  error?: string;
  fieldErrors?: Partial<Record<SignupField, string>>;
  success?: { email: string };
};

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    companyName: formData.get('companyName'),
    slug: formData.get('slug'),
    email: formData.get('email'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
    termsAccepted: formData.get('termsAccepted'),
    privacyAccepted: formData.get('privacyAccepted'),
    planCode: formData.get('planCode') ?? 'starter',
    planInterval: formData.get('planInterval') ?? 'monthly',
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<SignupField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field as SignupField] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { companyName, slug, email, password, planCode, planInterval } = parsed.data;

  // Slug-Verfügbarkeit prüfen — braucht Service-Role, weil RLS für Anon-User
  // sowohl bei existierendem als auch bei fehlendem Datensatz `null` liefert
  // (kein is_tenant_member-Match). Der Slug-Space ist tenant-global.
  const service = createSupabaseServiceClient();
  const { data: slugTaken, error: slugErr } = await service
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (slugErr) {
    return { error: 'Registrierung fehlgeschlagen. Bitte später erneut versuchen.' };
  }
  if (slugTaken) {
    return {
      fieldErrors: { slug: 'Dieses Kürzel ist bereits vergeben. Bitte ein anderes wählen.' },
    };
  }

  // Anon-Client für signUp, damit Supabase eingebauten Rate-Limit +
  // E-Mail-Verify-Flow greift. Erst nach E-Mail-Bestätigung wird der Tenant
  // im /auth/callback via Service-Role angelegt.
  const anon = await createSupabaseServerClient();
  const { error } = await anon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?flow=signup`,
      data: {
        display_name: email.split('@')[0],
        signup_company_name: companyName,
        signup_slug: slug,
        signup_terms_accepted_at: new Date().toISOString(),
        signup_plan_code: planCode,
        signup_plan_interval: planInterval,
      },
    },
  });

  if (error) {
    // Neutrale Fehlermeldung — keine Auskunft ob E-Mail bereits registriert ist.
    return {
      error:
        'Registrierung fehlgeschlagen. Bitte E-Mail und Passwort prüfen und erneut versuchen.',
    };
  }

  return { success: { email } };
}
