import type { MetadataRoute } from 'next';
import { clientEnv } from '@/lib/env';

// SEO: Nur oeffentliche Marketing- und Legal-Pfade duerfen indexiert werden.
// App-, API-, Portal- und Auth-Callback-Pfade bleiben ausgeschlossen.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/preise',
          '/impressum',
          '/datenschutz',
          '/agb',
          '/avv',
          '/hilfe',
          '/login',
          '/signup',
        ],
        disallow: [
          '/api/',
          '/auth/',
          '/dashboard',
          '/settings/',
          '/platform/',
          '/portal',
          '/portal/',
          '/no-access',
          '/zahlung-erforderlich',
          '/tarif-erforderlich',
          '/reset-password',
          '/invite',
          '/qr/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
