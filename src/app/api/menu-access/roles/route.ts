import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getAllRoles, isAdminRole } from '@/lib/models/roles';

/**
 * Daftar role yang bisa diatur hak menunya (semua role kecuali Admin —
 * Admin selalu punya akses penuh secara hardcode, tidak pernah diatur lewat sheet Menu Access).
 * "Admin" di sini mencakup role_key bawaan sistem 'admin' MAUPUN role lain yang ditandai
 * is_admin="Ya" di Master Role (permintaan user, hak Admin 100% identik — lihat isAdminRole()).
 * Sengaja tetap pakai requireAdmin() (bukan requirePermission), supaya halaman pengaturan
 * hak akses ini sendiri tidak bisa "mengunci diri" lewat matriks yang salah.
 */
export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  // Bugfix (permintaan user, item data-staleness): lihat catatan sama di GET /api/master/[entity].
  // Bugfix susulan ("Unexpected end of JSON input"): dibungkus try/catch — lihat catatan lengkap
  // di GET /api/master/[entity]/options.
  try {
    const roles = await getAllRoles({ useCache: false });
    const data = roles
      .filter((r) => !isAdminRole(r))
      // Bugfix (Fase 13): role yang sudah di-nonaktifkan lewat Master Role sebelumnya masih muncul
      // & bisa dipilih di dropdown ini — halaman Menu Access dipakai untuk MENGATUR hak akses role
      // yang sedang dipakai, jadi role tidak aktif (tidak dipakai user manapun untuk login efektif)
      // tidak perlu tampil di sini, konsisten dengan permintaan agar data tidak aktif tidak bisa
      // dipilih di form manapun.
      .filter((r) => r.status === 'Active')
      .map((r) => ({ value: r.id, label: r.role_name, roleKey: r.role_key }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error('GET /api/menu-access/roles gagal:', err);
    return NextResponse.json(
      { error: 'Gagal memuat daftar role dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}
