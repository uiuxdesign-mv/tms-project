import * as SheetTable from '@/lib/google/sheet-table';
import type { SheetRow } from '@/lib/google/sheet-table';

/**
 * Notifikasi in-app (permintaan user Round 5, poin 3 & 4): saat user mendapat penunjukan tugas
 * (delegasi task ke dia oleh orang lain), langsung tercatat di sini supaya bell notifikasi di
 * header bisa menampilkannya tanpa user perlu refresh (di-poll berkala, lihat
 * src/components/notification-bell.tsx).
 *
 * Sheet baru (spreadsheet terpisah, lihat spreadsheet-ids.ts SHEET_ID_NOTIFICATIONS), header:
 * id | user_id | type | task_id | task_title | actor_name | read_at | created_at
 *
 * - user_id: PENERIMA notifikasi (siapa yang harus melihatnya).
 * - type: jenis notifikasi, key stabil (BUKAN teks siap-tayang) supaya bisa diresolve ke ID/EN
 *   lewat translation key saat ditampilkan (pola sama seperti field_key di task_history).
 *   Untuk sekarang cuma 'task_assigned', disiapkan sebagai union type supaya gampang ditambah
 *   jenis lain nanti (mis. 'task_status_changed', 'comment_added') tanpa migrasi skema.
 * - task_title/actor_name: snapshot label pada SAAT notifikasi dibuat (bukan lookup ulang) —
 *   supaya tetap akurat & cepat dibaca walau task/user terkait belakangan berubah/dihapus, sama
 *   seperti pola old_value_label/new_value_label di task_history.
 * - read_at: kosong = belum dibaca; diisi timestamp saat user membuka/menandai dibaca.
 * - Append-only, tidak ada soft-delete — notifikasi lama otomatis tidak lagi muncul di badge
 *   unread begitu read_at terisi, tapi tetap ada di daftar (riwayat) selama belum dihapus manual.
 */
export type NotificationType = 'task_assigned';

export type NotificationRow = SheetRow & {
  id: string;
  user_id: string;
  type: NotificationType;
  task_id: string;
  task_title: string;
  actor_name: string;
  read_at: string;
  created_at: string;
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  taskId: string;
  taskTitle: string;
  actorName: string;
};

/**
 * Catat 1 notifikasi. Sengaja "fire-and-forget" (tidak pernah melempar error ke pemanggil) —
 * pola sama seperti logTaskChange()/logAction(): kalau sheet notifications belum dikonfigurasi
 * (env var SHEET_ID_NOTIFICATIONS belum diset) atau Google Sheets API bermasalah sesaat, aksi
 * UTAMA (buat/ubah task) tetap harus berhasil untuk user — kegagalan notifikasi TIDAK BOLEH
 * membatalkan atau memblokir aksi task yang sebenarnya.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (!input.userId) return;
  try {
    await SheetTable.insertRow('notifications', {
      user_id: input.userId,
      type: input.type,
      task_id: input.taskId,
      task_title: input.taskTitle,
      actor_name: input.actorName,
      read_at: '',
    });
  } catch (err) {
    console.error('[notifications] gagal membuat notifikasi:', err);
  }
}

/** Seluruh notifikasi milik 1 user, terbaru lebih dulu. */
export async function getNotificationsForUser(
  userId: string,
  opts: { useCache?: boolean } = {}
): Promise<NotificationRow[]> {
  const rows = (await SheetTable.getAll('notifications', opts)) as NotificationRow[];
  return rows
    .filter((r) => r.user_id === userId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** Tandai 1 notifikasi sudah dibaca — dicek dulu kepemilikannya (user_id harus cocok) supaya
 *  1 user tidak bisa menandai/mengintip notifikasi milik user lain lewat ID. */
export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  const row = await SheetTable.findById('notifications', id);
  if (!row || row.user_id !== userId) return false;
  if (!row.read_at) {
    await SheetTable.updateRow('notifications', id, { read_at: new Date().toISOString() });
  }
  return true;
}

/** Tandai SEMUA notifikasi milik user sebagai sudah dibaca (tombol "Tandai semua dibaca"). */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const rows = await getNotificationsForUser(userId, { useCache: false });
  const unread = rows.filter((r) => !r.read_at);
  const now = new Date().toISOString();
  await Promise.all(unread.map((r) => SheetTable.updateRow('notifications', r.id, { read_at: now })));
}
