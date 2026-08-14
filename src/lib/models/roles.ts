import * as SheetTable from '@/lib/google/sheet-table';

export type Role = {
  id: string;
  role_key: string;
  role_name: string;
  status: string;
  /** "Ya"/"Tidak" — ditandai Pemimpin lewat Master Role (fitur Leader Role). Mutually exclusive
   *  dengan is_admin (lihat validasi di POST/PATCH /api/master/[entity] untuk entity 'roles').
   *  Lihat catatan lengkap aturan Leader di src/lib/models/tasks.ts. */
  is_leader?: string;
  /**
   * "Ya"/"Tidak" — ditandai Admin lewat Master Role (permintaan user, perbaikan fitur Leader
   * Role: role LAIN selain role_key bawaan sistem 'admin' juga bisa diberi hak Admin PENUH,
   * 100% setara dengan role_key 'admin', di SELURUH aplikasi — bukan cuma modul Tasking).
   * Mutually exclusive dengan is_leader. Lihat isAdminRole() di bawah, dipakai menggantikan
   * hardcode `role_key === 'admin'` di seluruh kode (session.isAdmin dihitung dari sini saat
   * login, lihat src/app/api/auth/login/route.ts).
   */
  is_admin?: string;
};

/**
 * True kalau role ini setara Admin: role_key bawaan sistem 'admin', ATAU ditandai is_admin =
 * "Ya" di Master Role (permintaan user). Dipakai di SELURUH aplikasi menggantikan hardcode
 * `role_key === 'admin'` yang lama — role lain yang ditandai Admin lewat Master Role sekarang
 * dapat hak akses 100% identik (bypass Menu Access, Master Data/Users, kelola & lihat semua
 * Task, boleh menugaskan ke siapa saja kecuali sesama Admin — lihat src/lib/models/tasks.ts).
 */
export function isAdminRole(role: Pick<Role, 'role_key' | 'is_admin'> | undefined): boolean {
  if (!role) return false;
  return role.role_key === 'admin' || role.is_admin === 'Ya';
}

/** True kalau role ini Pemimpin (is_leader = "Ya") DAN BUKAN Admin — is_admin selalu menang
 *  kalau data ternyata (seharusnya tidak mungkin lewat form Master Role, sudah divalidasi mutually
 *  exclusive) kedua flag ke-isi "Ya" sekaligus. */
export function isLeaderRole(role: Pick<Role, 'role_key' | 'is_admin' | 'is_leader'> | undefined): boolean {
  if (!role) return false;
  return role.is_leader === 'Ya' && !isAdminRole(role);
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
