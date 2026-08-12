import * as SheetTable from '@/lib/google/sheet-table';
import type { EntityConfig } from './config';

export type SelectOption = { value: string; label: string };

/**
 * Resolusi opsi dropdown untuk semua field bertipe 'select' pada satu entity config.
 *
 * Bugfix (permintaan user, item speed & item data-staleness): field-field relasi (optionsFrom)
 * di-fetch PARALEL lewat Promise.all (sebelumnya berurutan satu per satu di dalam for-of), dan
 * SELALU `useCache: false` — opsi dropdown ini sering dibuka tepat setelah admin menambah/mengubah
 * data Master Data terkait (mis. tambah Client baru lalu langsung buka form Project), jadi harus
 * selalu baca langsung dari Google Sheets, bukan cache in-memory 30 detik yang bisa beda per
 * instance serverless.
 */
export async function resolveFieldOptions(config: EntityConfig): Promise<Record<string, SelectOption[]>> {
  const result: Record<string, SelectOption[]> = {};

  const relationFields = config.fields.filter((f) => (f.type === 'select' || f.type === 'multiselect') && f.optionsFrom);

  const fetched = await Promise.all(
    relationFields.map((field) => SheetTable.getAll(field.optionsFrom!, { useCache: false }))
  );

  relationFields.forEach((field, i) => {
    const rows = fetched[i];
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
  });

  for (const field of config.fields) {
    if (field.type !== 'select' && field.type !== 'multiselect') continue;
    if (field.optionsStatic) {
      result[field.key] = field.optionsStatic.map((v) => ({ value: v, label: v }));
    }
  }

  return result;
}
