import * as SheetTable from '@/lib/google/sheet-table';

/**
 * Ambil ID status yang ditandai is_default="Ya" (status awal untuk task baru). Dipakai untuk
 * menentukan apakah sebuah task masih berada di status awal — jendela waktu Pemberi Tugas boleh
 * mengedit field / menghapus task (lihat canEditTaskFieldsNow & canDeleteTask di
 * src/lib/models/tasks.ts).
 *
 * Return null kalau tidak ada status yang ditandai default (seharusnya tidak pernah terjadi
 * karena Master Status selalu dijaga tepat 1 default lewat enforceSingleDefaultStatus, tapi
 * tetap dijaga di sini supaya tidak melempar error kalau data belum lengkap).
 */
export async function getDefaultStatusId(opts?: { useCache?: boolean }): Promise<string | null> {
  const statuses = await SheetTable.getAll('statuses', opts);
  const def = statuses.find((s) => s.is_default === 'Ya');
  return def?.id ?? null;
}
