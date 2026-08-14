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
 * Admin (session.isAdmin — role_key bawaan 'admin' ATAU role lain yang ditandai is_admin="Ya" di
 * Master Role) selalu boleh, tidak tergantung data sheet Menu Access.
 * Role lain: dicek dari sheet Menu Access, baris role_id + menu_key yang cocok.
 * Tidak ada baris cocok = tidak boleh (fail-closed / default deny).
 */
export async function hasMenuPermission(
  session: SessionPayload,
  menuKey: string,
  action: MenuAction
): Promise<boolean> {
  if (session.isAdmin) return true;
  if (!session.roleId) return false;

  // Bugfix (permintaan user, item reliability): fungsi ini dipanggil di HAMPIR SETIAP page.tsx
  // (Server Component) untuk memutuskan boleh-tidaknya halaman dirender — sebelumnya TIDAK
  // dibungkus try/catch, jadi begitu Google Sheets API gagal sesaat (rate limit 429/hiccup)
  // sesudah retry di sheet-table.ts tetap habis, exception-nya tidak tertangani dan membuat
  // Next.js menampilkan halaman error generik ("This page couldn't load"). Sekarang di-fail-closed
  // (dianggap TIDAK punya izin, konsisten dengan filosofi default-deny yang sudah didokumentasikan
  // di atas) — user melihat pesan "tidak punya akses" yang sudah ada di tiap halaman, lalu bisa
  // coba lagi, bukan disambut layar error mentah.
  try {
    const row = await SheetTable.findOne(
      'menu_access',
      (r) => r.role_id === session.roleId && r.menu_key === menuKey
    );
    if (!row) return false;

    const column = `can_${action}` as const;
    return row[column] === 'Ya';
  } catch (e) {
    console.error(`[menu-access] hasMenuPermission(${menuKey}, ${action}) gagal, fail-closed:`, e);
    return false;
  }
}

/** Daftar menu_key yang boleh dilihat (can_view) oleh session ini. Admin = semua menu. */
export async function getVisibleMenuKeys(session: SessionPayload): Promise<Set<string>> {
  if (session.isAdmin) return new Set(MENU_KEYS.map((m) => m.key));
  if (!session.roleId) return new Set();

  // Bugfix (permintaan user, item reliability): sama seperti hasMenuPermission di atas — dipanggil
  // di navigasi/layout & Dashboard, fail-closed (Set kosong) kalau Google Sheets API bermasalah
  // supaya tidak menjatuhkan seluruh halaman dengan error mentah.
  try {
    const rows = await SheetTable.getAll('menu_access');
    const allowed = rows
      .filter((r) => r.role_id === session.roleId && r.can_view === 'Ya')
      .map((r) => r.menu_key);
    return new Set(allowed);
  } catch (e) {
    console.error('[menu-access] getVisibleMenuKeys gagal, fail-closed:', e);
    return new Set();
  }
}

/** Ambil matriks permission lengkap (semua MENU_KEYS) untuk satu role_id — dipakai halaman admin Menu Access. */
export async function getPermissionMatrixForRole(
  roleId: string,
  opts: { useCache?: boolean } = {}
): Promise<PermissionMatrixRow[]> {
  const rows = await SheetTable.getAll('menu_access', opts);
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
