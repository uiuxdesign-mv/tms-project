import * as SheetTable from '@/lib/google/sheet-table';

/**
 * Menjamin hanya ada TEPAT SATU baris Status dengan is_default="Ya" (Fase 7) — meniru
 * Status::clearDefaultFlag() di aplikasi lama. Dipanggil setelah insert/update baris Status
 * yang is_default-nya di-set "Ya": semua baris statuses LAIN otomatis dipaksa "Tidak".
 */
export async function enforceSingleDefaultStatus(keepId: string): Promise<void> {
  const rows = await SheetTable.getAll('statuses');
  for (const row of rows) {
    if (row.id !== keepId && row.is_default === 'Ya') {
      await SheetTable.updateRow('statuses', row.id, { is_default: 'Tidak' });
    }
  }
}

/**
 * Menjamin paling banyak SATU baris Status dengan is_review="Ya" (Fase 8, Time Tracking) — status
 * ini menandai tahap "review" yang otomatis dimasuki saat sesi kerja Time Tracking dihentikan
 * (lihat src/lib/models/time-tracking.ts). Beda dari is_default, is_review BOLEH kosong sama
 * sekali (berarti alur kerja tidak punya tahap review terpisah, tombol Stop tidak akan
 * mengarah ke status manapun secara otomatis).
 */
export async function enforceSingleReviewStatus(keepId: string): Promise<void> {
  const rows = await SheetTable.getAll('statuses');
  for (const row of rows) {
    if (row.id !== keepId && row.is_review === 'Ya') {
      await SheetTable.updateRow('statuses', row.id, { is_review: 'Tidak' });
    }
  }
}
