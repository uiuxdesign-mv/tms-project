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

  const roles = await getAllRoles();
  const data = roles
    .filter((r) => r.role_key !== 'admin')
    .map((r) => ({ value: r.id, label: r.role_name, roleKey: r.role_key }));

  return NextResponse.json({ data });
}
