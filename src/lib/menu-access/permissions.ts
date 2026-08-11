import * as SheetTable from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';
import { MENU_KEYS, type MenuAction } from './config';

export type PermissionMatrixRow = {
  menu_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
};

/**
 * Cek apakah session boleh melakukan `action` pada `menuKey`.
 * Admin selalu boleh (hardcode, tidak tergantung data sheet Menu Access).
 * Role lain: dicek dari sheet Menu Access, baris role_id + menu_key yang cocok.
 * Tidak ada baris cocok = tidak boleh (fail-closed / default deny).
 */
export async function hasMenuPermission(
  session: SessionPayload,
  menuKey: string,
  action: MenuAction
): Promise<boolean> {
  if (session.roleKey === 'admin') return true;
  if (!session.roleId) return false;

  const row = await SheetTable.findOne(
    'menu_access',
    (r) => r.role_id === session.roleId && r.menu_key === menuKey
  );
  if (!row) return false;

  const column = `can_${action}` as const;
  return row[column] === 'Ya';
}

/** Daftar menu_key yang boleh dilihat (can_view) oleh session ini. Admin = semua menu. */
export async function getVisibleMenuKeys(session: SessionPayload): Promise<Set<string>> {
  if (session.roleKey === 'admin') return new Set(MENU_KEYS.map((m) => m.key));
  if (!session.roleId) return new Set();

  const rows = await SheetTable.getAll('menu_access');
  const allowed = rows
    .filter((r) => r.role_id === session.roleId && r.can_view === 'Ya')
    .map((r) => r.menu_key);
  return new Set(allowed);
}

/** Ambil matriks permission lengkap (semua MENU_KEYS) untuk satu role_id — dipakai halaman admin Menu Access. */
export async function getPermissionMatrixForRole(roleId: string): Promise<PermissionMatrixRow[]> {
  const rows = await SheetTable.getAll('menu_access');
  const byMenuKey = new Map(rows.filter((r) => r.role_id === roleId).map((r) => [r.menu_key, r]));

  return MENU_KEYS.map(({ key }) => {
    const row = byMenuKey.get(key);
    return {
      menu_key: key,
      can_view: row?.can_view === 'Ya',
      can_create: row?.can_create === 'Ya',
      can_edit: row?.can_edit === 'Ya',
      can_delete: row?.can_delete === 'Ya',
      can_export: row?.can_export === 'Ya',
    };
  });
}

/** Simpan matriks permission untuk satu role_id (upsert per menu_key). */
export async function savePermissionMatrixForRole(roleId: string, matrix: PermissionMatrixRow[]): Promise<void> {
  const rows = await SheetTable.getAll('menu_access');
  const existingByMenuKey = new Map(rows.filter((r) => r.role_id === roleId).map((r) => [r.menu_key, r]));

  for (const entry of matrix) {
    if (!MENU_KEYS.some((m) => m.key === entry.menu_key)) continue; // abaikan menu_key tidak dikenal

    const payload = {
      role_id: roleId,
      menu_key: entry.menu_key,
      can_view: entry.can_view ? 'Ya' : 'Tidak',
      can_create: entry.can_create ? 'Ya' : 'Tidak',
      can_edit: entry.can_edit ? 'Ya' : 'Tidak',
      can_delete: entry.can_delete ? 'Ya' : 'Tidak',
      can_export: entry.can_export ? 'Ya' : 'Tidak',
    };

    const existing = existingByMenuKey.get(entry.menu_key);
    if (existing) {
      await SheetTable.updateRow('menu_access', existing.id, payload);
    } else {
      await SheetTable.insertRow('menu_access', payload);
    }
  }
}
