import * as SheetTable from '@/lib/google/sheet-table';

/** Peta id Employment Type -> apakah tipe itu boleh menugaskan ke user lain. */
export async function getCanAssignMap(): Promise<Record<string, boolean>> {
  const rows = await SheetTable.getAll('employment_types');
  const map: Record<string, boolean> = {};
  rows.forEach((r) => {
    map[r.id] = r.can_assign_to_others === 'Ya';
  });
  return map;
}
