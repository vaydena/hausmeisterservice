import 'server-only';
import { serverEnv } from '@/lib/env';
import { LogEmailProvider } from './log-provider';
import { ResendEmailProvider } from './resend-provider';
import { SmtpEmailProvider } from './smtp-provider';
import type { EmailAddress, EmailProvider } from './types';

/**
 * Wählt den Provider anhand der Env, in dieser Reihenfolge:
 *   1. Vollständige SMTP-Konfiguration (SMTP_HOST + SMTP_USER + SMTP_PASS) →
 *      SMTP über ein echtes Postfach (Prod: Hostinger, noreply@vaydena.de).
 *   2. sonst RESEND_API_KEY → Resend.
 *   3. sonst Log-Provider (Dev/Test, kein echter Versand).
 */
export function getEmailProvider(): EmailProvider {
  const env = serverEnv();
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return new SmtpEmailProvider({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 465,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    });
  }
  if (env.RESEND_API_KEY && env.RESEND_API_KEY.length > 0) {
    return new ResendEmailProvider(env.RESEND_API_KEY);
  }
  return new LogEmailProvider();
}

/**
 * Absender-Adresse aus der Env. Fällt auf einen Dev-Default zurück, damit
 * lokale Tests laufen, ohne dass die App crasht. In Prod muss EMAIL_FROM_ADDRESS
 * gesetzt sein — der Resend-Provider würde ohne gültige, verifizierte Domain
 * ohnehin nicht durchgehen.
 */
export function getDefaultFromAddress(): EmailAddress {
  const env = serverEnv();
  return {
    address: env.EMAIL_FROM_ADDRESS ?? 'noreply@hausmeisterservice.local',
    name: env.EMAIL_FROM_NAME ?? null,
  };
}

export function getDefaultReplyTo(): string | null {
  const env = serverEnv();
  return env.EMAIL_REPLY_TO ?? env.EMAIL_FROM_ADDRESS ?? null;
}
