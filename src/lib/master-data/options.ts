import * as SheetTable from '@/lib/google/sheet-table';
import type { EntityConfig } from './config';

export type SelectOption = { value: string; label: string };

/** Resolusi opsi dropdown untuk semua field bertipe 'select' pada satu entity config. */
export async function resolveFieldOptions(config: EntityConfig): Promise<Record<string, SelectOption[]>> {
  const result: Record<string, SelectOption[]> = {};

  for (const field of config.fields) {
    if (field.type !== 'select' && field.type !== 'multiselect') continue;

    if (field.optionsStatic) {
      result[field.key] = field.optionsStatic.map((v) => ({ value: v, label: v }));
    } else if (field.optionsFrom) {
      const rows = await SheetTable.getAll(field.optionsFrom);
      // Bugfix (Fase 13, defensif): kalau suatu saat ada field select relasi lagi (mis. balik lagi
      // seperti Project->Client di versi lama), baris yang sudah di-nonaktifkan di sheet sumbernya
      // tidak boleh ikut muncul sebagai opsi baru — samakan dengan aturan "data tidak aktif tidak
      // bisa dipilih" yang berlaku di semua form lain. `status !== 'Inactive'` (bukan `=== 'Active'`)
      // supaya tetap aman untuk sheet yang tidak/belum punya kolom status sama sekali.
      result[field.key] = rows
        .filter((r) => r.status !== 'Inactive')
        .map((r) => ({
          value: r.id,
          label: r[field.optionsLabelKey || 'name'] || r.id,
        }));
    }
  }

  return result;
}
