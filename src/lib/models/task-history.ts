import * as SheetTable from '@/lib/google/sheet-table';
import type { SheetRow } from '@/lib/google/sheet-table';
import type { SheetKey } from '@/lib/google/spreadsheet-ids';

/**
 * Log history perubahan task (permintaan user poin 4): setiap perubahan INFORMASI field (judul,
 * deskripsi, client, project, dst) dan setiap perubahan STATUS dicatat di sini — siapa
 * (changed_by, id user) & kapan (created_at, otomatis lewat SheetTable.insertRow), lengkap dengan
 * label lama/baru yang sudah dalam bentuk manusiawi (bukan ID mentah) supaya bisa langsung
 * ditampilkan tanpa lookup tambahan di UI.
 *
 * Sheet baru (spreadsheet terpisah, lihat spreadsheet-ids.ts SHEET_ID_TASK_HISTORY), header:
 * id | task_id | change_type | field_key | old_value_label | new_value_label | changed_by | created_at
 *
 * - change_type: 'field' (perubahan salah satu field informasi) atau 'status' (perubahan status).
 * - field_key: nama field yang berubah (mis. 'title', 'assigned_to', 'due_date'), atau 'status_id'
 *   untuk entri bertipe 'status'. Disimpan sebagai KEY (bukan label Indonesia siap-tayang) supaya
 *   UI bisa me-resolve label sesuai bahasa aktif (ID/EN) lewat translation key yang sudah ada
 *   (td_field_*), konsisten dengan konfigurasi bahasa aplikasi.
 * - old_value_label/new_value_label: label yang SUDAH di-resolve ke bentuk manusiawi (nama
 *   client/project/user/status, bukan ID) pada SAAT perubahan terjadi — supaya riwayat tetap
 *   akurat historis walau data master terkait belakangan berubah nama/dihapus.
 * - changed_by: HANYA id user (bukan nama) — nama di-resolve saat baca (read-time), mengikuti
 *   pola yang sudah ada di GET /api/tasks/[id]/comments (nameById.get(...)), supaya tidak perlu
 *   baca sheet users tambahan di setiap aksi Time Tracking/update task.
 * - Append-only, tidak ada updated_at/deleted_at (riwayat tidak pernah diedit/dihapus).
 */
// Perbaikan (permintaan user: "catat juga di aktifitas perubahan saat melakukan action jeda dan
// saat melakukan resume di tasking"): tambah 'time_tracking' — dipakai KHUSUS untuk aksi Jeda
// (pause) & Lanjutkan (resume), yang BEDA sifatnya dari 'field'/'status': keduanya bukan
// perubahan NILAI suatu kolom (tidak ada "dari X menjadi Y"), melainkan sebuah AKSI momentual.
// Lihat logTimeTrackingHistory() di bawah untuk detail kenapa ini tidak lewat logTaskChange().
export type TaskHistoryChangeType = 'field' | 'status' | 'time_tracking';

export type TaskHistoryRow = SheetRow & {
  id: string;
  task_id: string;
  change_type: TaskHistoryChangeType;
  field_key: string;
  old_value_label: string;
  new_value_label: string;
  changed_by: string;
  created_at: string;
};

export type LogTaskChangeInput = {
  taskId: string;
  changeType: TaskHistoryChangeType;
  fieldKey: string;
  oldValueLabel: string;
  newValueLabel: string;
  changedBy: string;
};

/**
 * Catat 1 entri history. Sengaja "fire-and-forget" (tidak pernah melempar error ke pemanggil) —
 * meniru logAction() di audit-log.ts: kalau sheet task_history belum dikonfigurasi (Sheet ID
 * belum dikirim user / env var belum diset di Vercel) atau Google Sheets API bermasalah sesaat,
 * operasi UTAMA (update task / ubah status) tetap harus berhasil untuk user — kegagalan logging
 * history TIDAK BOLEH membatalkan atau memblokir aksi task yang sebenarnya. Kegagalan hanya
 * dicatat ke console server.
 */
export async function logTaskChange(input: LogTaskChangeInput): Promise<void> {
  // Nilai lama & baru yang sama-sama kosong tidak perlu dicatat (mis. field yang memang tidak
  // pernah diisi, tetap tidak diisi).
  if (!input.oldValueLabel && !input.newValueLabel) return;
  if (input.oldValueLabel === input.newValueLabel) return;

  try {
    await SheetTable.insertRow('task_history', {
      task_id: input.taskId,
      change_type: input.changeType,
      field_key: input.fieldKey,
      old_value_label: input.oldValueLabel,
      new_value_label: input.newValueLabel,
      changed_by: input.changedBy,
    });
  } catch (err) {
    console.error('[task-history] gagal mencatat perubahan:', err);
  }
}

export type LogTimeTrackingHistoryInput = {
  taskId: string;
  action: 'pause' | 'resume';
  changedBy: string;
};

/**
 * Catat aksi Jeda/Lanjutkan Time Tracking ke riwayat task (permintaan user, poin 1: "catat juga di
 * aktifitas perubahan saat melakukan action jeda dan saat melakukan resume di tasking"). SENGAJA
 * TIDAK lewat logTaskChange() di atas — fungsi itu punya guard "lewati kalau old===new atau
 * keduanya kosong" yang cocok untuk perubahan NILAI field/status, tapi Jeda/Lanjutkan tidak punya
 * old/new value sama sekali (murni sebuah AKSI), jadi guard itu justru akan salah-diam-diam
 * melewatkan entrinya (old_value_label & new_value_label sama-sama kosong).
 *
 * `field_key` menyimpan KEY aksi ('pause'/'resume', BUKAN label siap-tayang bahasa tertentu) —
 * sama pola dengan field_key di change_type 'field' — supaya UI (task-activity-feed.tsx) bisa
 * me-resolve teksnya sesuai bahasa aktif (ID/EN) lewat translation key `history_tt_pause`/
 * `history_tt_resume`, konsisten dengan "konfigurasi bahasa" aplikasi.
 *
 * Sengaja fire-and-forget sama seperti logTaskChange — kegagalan mencatat riwayat TIDAK PERNAH
 * boleh membatalkan/menunda aksi Time Tracking yang sebenarnya (lihat pemanggilnya di
 * src/app/api/tasks/[id]/time-tracking/route.ts, dijalankan lewat after() supaya juga tidak
 * memperlambat response — permintaan user poin 2 "aksi ... masih sering lama merespon").
 */
export async function logTimeTrackingHistory(input: LogTimeTrackingHistoryInput): Promise<void> {
  try {
    await SheetTable.insertRow('task_history', {
      task_id: input.taskId,
      change_type: 'time_tracking',
      field_key: input.action,
      old_value_label: '',
      new_value_label: '',
      changed_by: input.changedBy,
    });
  } catch (err) {
    console.error('[task-history] gagal mencatat aksi Time Tracking:', err);
  }
}

/** Ambil seluruh riwayat 1 task, terlama lebih dulu (urutan kronologis, sama seperti komentar). */
export async function getHistoryForTask(taskId: string): Promise<TaskHistoryRow[]> {
  const rows = (await SheetTable.getAll('task_history')) as TaskHistoryRow[];
  return rows
    .filter((r) => r.task_id === taskId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

/** Resolve 1 ID master-data ke label manusiawinya (mis. client_id -> nama client). String kosong
 *  kalau id kosong atau datanya sudah tidak ada lagi (dihapus). */
export async function resolveEntityLabel(sheetKey: SheetKey, titleField: string, id: string): Promise<string> {
  if (!id) return '';
  const row = await SheetTable.findById(sheetKey, id);
  return row ? String(row[titleField] || '') : '';
}

export type FieldDiffSpec = {
  fieldKey: string;
  changeType: TaskHistoryChangeType;
  oldValue: string;
  newValue: string;
  /** Default: dipakai apa adanya (field teks seperti judul/tanggal). Untuk field ber-relasi ke
   *  master data (client/project/assignee/dst), sisipkan resolveEntityLabel yang sesuai. */
  resolveLabel?: (value: string) => Promise<string>;
};

/**
 * Bandingkan satu set field lama vs baru sekaligus, catat 1 entri history untuk tiap field yang
 * BENAR-BENAR berubah (dipakai setelah PATCH /api/tasks/[id] berhasil update). Dipanggil dari
 * dalam after() di route handler supaya tidak memperlambat response, dan dibungkus try/catch di
 * pemanggil supaya kegagalan logging tidak pernah mengganggu apa pun.
 */
export async function logTaskFieldDiffs(taskId: string, changedBy: string, diffs: FieldDiffSpec[]): Promise<void> {
  for (const d of diffs) {
    const oldV = d.oldValue ?? '';
    const newV = d.newValue ?? '';
    if (oldV === newV) continue;
    const resolve = d.resolveLabel ?? ((v: string) => Promise.resolve(v));
    const [oldLabel, newLabel] = await Promise.all([resolve(oldV), resolve(newV)]);
    await logTaskChange({
      taskId,
      changeType: d.changeType,
      fieldKey: d.fieldKey,
      oldValueLabel: oldLabel,
      newValueLabel: newLabel,
      changedBy,
    });
  }
}
