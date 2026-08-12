import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getAllRoles } from '@/lib/models/roles';

/**
 * Daftar role yang bisa diatur hak menunya (semua role kecuali Admin —
 * Admin selalu punya akses penuh secara hardcode, tidak pernah diatur lewat sheet Menu Access).
 * Sengaja tetap pakai requireAdmin() (bukan requirePermission), supaya halaman pengaturan
 * hak akses ini sendiri tidak bisa "mengunci diri" lewat matriks yang salah.
 */
export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  // Bugfix (permintaan user, item data-staleness): lihat catatan sama di GET /api/master/[entity].
  const roles = await getAllRoles({ useCache: false });
  const data = roles
    .filter((r) => r.role_key !== 'admin')
    // Bugfix (Fase 13): role yang sudah di-nonaktifkan lewat Master Role sebelumnya masih muncul
    // & bisa dipilih di dropdown ini — halaman Menu Access dipakai untuk MENGATUR hak akses role
    // yang sedang dipakai, jadi role tidak aktif (tidak dipakai user manapun untuk login efektif)
    // tidak perlu tampil di sini, konsisten dengan permintaan agar data tidak aktif tidak bisa
    // dipilih di form manapun.
    .filter((r) => r.status === 'Active')
    .map((r) => ({ value: r.id, label: r.role_name, roleKey: r.role_key }));

  return NextResponse.json({ data });
}
