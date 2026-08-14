import * as SheetTable from '@/lib/google/sheet-table';

export type Role = {
  id: string;
  role_key: string;
  role_name: string;
  status: string;
  /** "Ya"/"Tidak" — ditandai admin lewat Master Role (permintaan user, fitur Leader Role). Lihat
   *  catatan lengkap aturan Leader di src/lib/models/tasks.ts. */
  is_leader?: string;
};

/** Role dengan role_key 'admin', ATAU role yang ditandai Pemimpin (is_leader = "Ya") — dua-duanya
 *  TIDAK BOLEH ditugaskan task oleh siapa pun (permintaan user: "Admin tidak dapat diberikan
 *  tugas oleh user lain" + fitur Leader Role). Dipakai untuk menyaring opsi dropdown Assignee
 *  (GET /api/tasks/options) dan validasi assignee di server (POST/PATCH /api/tasks). */
export function isNonAssignableRole(role: Pick<Role, 'role_key' | 'is_leader'> | undefined): boolean {
  if (!role) return false;
  return role.role_key === 'admin' || role.is_leader === 'Ya';
}

export async function findRoleById(id: string): Promise<Role | undefined> {
  const row = await SheetTable.findById('roles', id);
  return row as Role | undefined;
}

export async function getAllRoles(opts: { useCache?: boolean } = {}): Promise<Role[]> {
  const rows = await SheetTable.getAll('roles', opts);
  return rows as Role[];
}

/**
 * Fase 12: form Master Role tidak lagi menampilkan input "Kode Role" (sesuai video) — role_key
 * sekarang di-generate otomatis dari role_name di server saat baris baru dibuat, meniru slug
 * yang dulu diketik manual admin. Kolom role_key TETAP dipertahankan di sheet karena dipakai luas
 * di kode sebagai bypass permission hardcoded (roleKey === 'admin').
 */
export async function generateUniqueRoleKey(roleName: string): Promise<string> {
  const base =
    roleName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[0-9]/, 'r_$&') || 'role';

  const existing = await SheetTable.getAll('roles', { includeDeleted: true });
  const existingKeys = new Set(existing.map((r) => r.role_key));

  if (!existingKeys.has(base)) return base;
  let n = 2;
  while (existingKeys.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
