import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getAllRoles } from '@/lib/models/roles';
import * as SheetTable from '@/lib/google/sheet-table';

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const roles = await getAllRoles();
  const employmentTypes = await SheetTable.getAll('employment_types');

  // `active` dikirim ke client supaya dropdown Tambah/Edit User bisa menyembunyikan role/tipe
  // kepegawaian yang sudah Inactive (Fase 7) — kecuali baris yang sedang dipilih user yang
  // sedang diedit, supaya nilai lama tetap terlihat (client yang memutuskan, lihat users-table.tsx).
  return NextResponse.json({
    data: {
      roles: roles.map((r) => ({ value: r.id, label: r.role_name, roleKey: r.role_key, active: r.status === 'Active' })),
      employmentTypes: employmentTypes.map((e) => ({
        value: e.id,
        label: e.type_name,
        canAssignToOthers: e.can_assign_to_others === 'Ya',
        active: e.status === 'Active',
      })),
    },
  });
}
