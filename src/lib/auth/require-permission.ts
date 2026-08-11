import { NextResponse } from 'next/server';
import { getSession } from './get-session';
import type { SessionPayload } from './session';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import type { MenuAction } from '@/lib/menu-access/config';

/**
 * Guard per-role per-menu (Fase 3), pengganti requireAdmin() yang lama untuk Master Data & Users.
 * Admin selalu lolos (dihitung ulang di hasMenuPermission, bukan dipercaya dari client).
 * Role lain: dicek dari sheet Menu Access. Tidak ada baris = default ditolak (fail-closed),
 * jadi migrasi dari requireAdmin() tidak membuka akses baru sebelum Admin mengatur permission-nya.
 */
export async function requirePermission(
  menuKey: string,
  action: MenuAction
): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Belum login.' }, { status: 401 }) };
  }

  const allowed = await hasMenuPermission(session, menuKey, action);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Anda tidak punya akses ke fitur ini.' }, { status: 403 }) };
  }

  return { session };
}
