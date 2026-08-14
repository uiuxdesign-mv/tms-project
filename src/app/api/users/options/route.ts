import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getAllRoles, isAdminRole } from '@/lib/models/roles';
import * as SheetTable from '@/lib/google/sheet-table';

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  // Bugfix (permintaan user, item data-staleness): lihat catatan sama di GET /api/master/[entity].
  // Bugfix susulan ("Unexpected end of JSON input"): dibungkus try/catch — lihat catatan lengkap
  // di GET /api/master/[entity]/options.
  try {
    const [roles, employmentTypes] = await Promise.all([
      getAllRoles({ useCache: false }),
      SheetTable.getAll('employment_types', { useCache: false }),
    ]);

    // `active` dikirim ke client supaya dropdown Tambah/Edit User bisa menyembunyikan role/tipe
    // kepegawaian yang sudah Inactive (Fase 7) — kecuali baris yang sedang dipilih user yang
    // sedang diedit, supaya nilai lama tetap terlihat (client yang memutuskan, lihat users-table.tsx).
    return NextResponse.json({
      data: {
        // isAdminEquivalent (permintaan user): true untuk role_key bawaan sistem 'admin' MAUPUN
        // role lain yang ditandai is_admin="Ya" di Master Role — dipakai client (users-table.tsx)
        // menggantikan cek lama `roleKey === 'admin'` supaya form Tambah/Edit User menyembunyikan
        // Employment Type untuk role Admin mana pun, bukan cuma role bawaan sistem.
        roles: roles.map((r) => ({
          value: r.id,
          label: r.role_name,
          roleKey: r.role_key,
          isAdminEquivalent: isAdminRole(r),
          active: r.status === 'Active',
        })),
        employmentTypes: employmentTypes.map((e) => ({
          value: e.id,
          label: e.type_name,
          canAssignToOthers: e.can_assign_to_others === 'Ya',
          active: e.status === 'Active',
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/users/options gagal:', err);
    return NextResponse.json(
      { error: 'Gagal memuat opsi dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}
