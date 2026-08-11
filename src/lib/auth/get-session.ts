import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from './session';

/** Dipakai di Server Component / Route Handler untuk membaca sesi user yang sedang login. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
