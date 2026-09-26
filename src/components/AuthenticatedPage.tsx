import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { COOKIE, verifySession } from '@/lib/auth';
import { SessionGate } from './SessionGate';

export async function AuthenticatedPage({ children }: { children: ReactNode }) {
  if (!await verifySession((await cookies()).get(COOKIE)?.value)) redirect('/login');
  return <SessionGate>{children}</SessionGate>;
}
