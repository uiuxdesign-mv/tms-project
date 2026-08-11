import { NextResponse } from 'next/server';
import { getSession } from './get-session';
import type { SessionPayload } from './session';

/**
 * Guard sederhana: hanya role 'admin' yang boleh mengelola master data untuk saat ini.
 * Nanti di Fase 3 (Menu & Access Control) ini akan diganti dengan pengecekan
 * per-role per-menu dari sheet Menu Access, bukan hardcode admin-only.
 */
export async function requireAdmin(): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Belum login.' }, { status: 401 }) };
  }
  if (session.roleKey !== 'admin') {
    return { error: NextResponse.json({ error: 'Anda tidak punya akses ke fitur ini.' }, { status: 403 }) };
  }
  return { session };
}
