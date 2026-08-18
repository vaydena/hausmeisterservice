'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Building2,
  TriangleAlert,
  FileText,
  Receipt,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react';

const ITEMS = [
  { href: '/owner/dashboard', label: 'Übersicht', icon: Home },
  { href: '/owner/objekte', label: 'Objekte', icon: Building2 },
  { href: '/owner/maengel', label: 'Mängel', icon: TriangleAlert },
  { href: '/owner/berichte', label: 'Arbeitsberichte', icon: FileText },
  { href: '/owner/rechnungen', label: 'Rechnungen', icon: Receipt },
  { href: '/owner/dokumente', label: 'Dokumente', icon: FolderOpen },
  { href: '/owner/fotos', label: 'Fotos', icon: ImageIcon },
] as const;

export function OwnerNav() {
  const pathname = usePathname();

  return (
    <>
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
              active
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
