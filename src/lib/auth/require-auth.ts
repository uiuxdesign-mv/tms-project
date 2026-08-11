import { NextResponse } from 'next/server';
import { getSession } from './get-session';
import type { SessionPayload } from './session';

/** Guard: siapa saja yang sudah login boleh lewat (dipakai untuk Tasks — beda dari requireAdmin di Master Data). */
export async function requireAuth(): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Belum login.' }, { status: 401 }) };
  }
  return { session };
}
