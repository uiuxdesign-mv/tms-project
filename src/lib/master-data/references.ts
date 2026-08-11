import type { SheetKey } from '@/lib/google/spreadsheet-ids';
import * as SheetTable from '@/lib/google/sheet-table';

/**
 * Daftar "siapa mereferensikan siapa" — dipakai untuk mencegah penghapusan
 * master data yang masih dipakai oleh data lain (mis. Client tidak boleh
 * dihapus kalau masih ada Project atau Task yang menunjuk ke Client itu).
 *
 * Google Sheets tidak punya foreign key seperti MySQL, jadi pengecekan ini
 * murni dilakukan di kode aplikasi.
 *
 * Fase 7: ditambahkan referensi ke `tasks` untuk clients/projects/priorities/task_types/statuses
 * (sebelumnya hanya clients->projects dan roles/employment_types->users — Project, Priority,
 * Task Type, Status yang masih dipakai task aktif bisa dihapus begitu saja tanpa guard,
 * menyisakan data orphan di Tasking).
 */
const REVERSE_REFERENCES: Partial<Record<SheetKey, { sheet: SheetKey; field: string; label: string }[]>> = {
  clients: [
    { sheet: 'projects', field: 'client_id', label: 'Project' },
    { sheet: 'tasks', field: 'client_id', label: 'Task' },
  ],
  projects: [{ sheet: 'tasks', field: 'project_id', label: 'Task' }],
  priorities: [{ sheet: 'tasks', field: 'priority_id', label: 'Task' }],
  task_types: [{ sheet: 'tasks', field: 'task_type_id', label: 'Task' }],
  statuses: [{ sheet: 'tasks', field: 'status_id', label: 'Task' }],
  roles: [{ sheet: 'users', field: 'role_id', label: 'User' }],
  employment_types: [{ sheet: 'users', field: 'employment_type_id', label: 'User' }],
};

export function getReverseReferenceDefs(sheetKey: SheetKey) {
  return REVERSE_REFERENCES[sheetKey] || [];
}

export async function findBlockingReferences(
  sheetKey: SheetKey,
  id: string
): Promise<{ blocked: boolean; message?: string; reassignable?: boolean }> {
  const refs = REVERSE_REFERENCES[sheetKey];
  if (!refs || refs.length === 0) return { blocked: false };

  for (const ref of refs) {
    const rows = await SheetTable.findMany(ref.sheet, (r) => r[ref.field] === id);
    if (rows.length > 0) {
      return {
        blocked: true,
        reassignable: true,
        message: `Tidak bisa dihapus — masih dipakai oleh ${rows.length} data ${ref.label}. Gunakan "Ganti & Hapus" untuk memindahkan data tersebut ke pilihan lain terlebih dahulu.`,
      };
    }
  }

  return { blocked: false };
}

/**
 * "Replace Existing Data" (Fase 7) — memindahkan semua baris yang mereferensikan `fromId`
 * supaya menunjuk ke `toId`, di semua sheet yang terdaftar di REVERSE_REFERENCES untuk
 * `sheetKey`, lalu mengembalikan jumlah baris yang dipindahkan. Dipanggil sebelum soft-delete
 * `fromId` — meniru TaskType::reassignAndDelete() di aplikasi lama, tapi digeneralisasi untuk
 * semua entity Master Data yang direferensikan Task (Client/Project/Priority/Task Type/Status),
 * bukan cuma Task Type.
 */
export async function reassignReferences(sheetKey: SheetKey, fromId: string, toId: string): Promise<number> {
  const refs = REVERSE_REFERENCES[sheetKey];
  if (!refs || refs.length === 0) return 0;

  let count = 0;
  for (const ref of refs) {
    const rows = await SheetTable.findMany(ref.sheet, (r) => r[ref.field] === fromId);
    for (const row of rows) {
      await SheetTable.updateRow(ref.sheet, row.id, { [ref.field]: toId });
      count++;
    }
  }
  return count;
}
