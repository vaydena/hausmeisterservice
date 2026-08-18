import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';

export default async function OwnerIndex() {
  const ctx = await getOwnerContext();
  redirect(ctx ? '/owner/dashboard' : '/owner/login');
}
