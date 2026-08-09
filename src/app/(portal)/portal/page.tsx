import { redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';

export default async function PortalIndex() {
  const ctx = await getResidentContext();
  redirect(ctx ? '/portal/dashboard' : '/portal/login');
}
