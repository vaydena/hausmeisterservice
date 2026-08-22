import type { MetadataRoute } from 'next';
import { clientEnv } from '@/lib/env';

// Sitemap fuer Suchmaschinen: nur oeffentliche Marketing- und Legal-Pfade.
// App-, Portal- und Auth-Pfade sind entweder auth-only oder liefern nichts
// Sinnvolles fuer den Index.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const now = new Date();

  const pages: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  }> = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/preise', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/login', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/signup', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/impressum', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/datenschutz', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/agb', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/avv', priority: 0.3, changeFrequency: 'yearly' },
  ];

  return pages.map((p) => ({
    url: `${baseUrl}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
