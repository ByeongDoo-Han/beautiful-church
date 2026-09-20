import { cloudConfigured, COOKIE, verifySession } from '@/lib/auth';
import { cookies } from 'next/headers';
export async function GET() {
  return Response.json({ cloud: cloudConfigured(), authenticated: await verifySession((await cookies()).get(COOKIE)?.value) });
}
