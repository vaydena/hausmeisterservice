import 'server-only';
import QRCode from 'qrcode';
import { clientEnv } from '@/lib/env';

export const QR_ENTITY_TYPES = [
  'property',
  'unit',
  'building',
  'key',
  'meter',
  'vehicle',
  'material',
  'defect-report',
  'work-order',
] as const;
export type QrEntityType = (typeof QR_ENTITY_TYPES)[number];

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isValidQrType(v: unknown): v is QrEntityType {
  return typeof v === 'string' && (QR_ENTITY_TYPES as readonly string[]).includes(v);
}

export function isValidUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
}

const PATH_FOR_TYPE: Record<QrEntityType, (id: string) => string> = {
  property: (id) => `/properties/${id}`,
  unit: (id) => `/properties/units/${id}`,
  building: (id) => `/properties/buildings/${id}`,
  key: (id) => `/keys/${id}`,
  meter: (id) => `/meters/${id}`,
  vehicle: (id) => `/vehicles/${id}`,
  material: (id) => `/materials/${id}`,
  'defect-report': (id) => `/defect-reports/${id}`,
  'work-order': (id) => `/work-orders/${id}`,
};

export function buildDeepLink(type: QrEntityType, id: string): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const path = PATH_FOR_TYPE[type](id);
  return `${base}${path}?src=qr`;
}

export async function generateQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
