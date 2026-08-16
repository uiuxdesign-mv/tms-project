import { setViewCache } from '@/lib/hooks/view-cache';

/**
 * Perbaikan (permintaan user poin 3 — "ketika saya berpindah view pada halaman tasking ...
 * tampilan muncul 'memuat' ... ini masih terjadi diawal"): List (`/tasks`), Kanban
 * (`/tasks/kanban`), dan Calendar (`/tasks/calendar`) masing-masing route Next.js TERPISAH yang
 * me-mount komponennya dari NOL tiap kali dibuka (lihat catatan lengkap di view-cache.ts) — tapi
 * ketiganya mengambil data dari endpoint yang PERSIS SAMA (`GET /api/tasks` + `GET
 * /api/tasks/options`), cuma cara MENAMPILKANNYA yang beda. Cache antar-tab (Round 7, poin 3)
 * sebelumnya hanya mengisi kunci cache milik tab yang SEDANG dibuka — jadi kalau user baru buka
 * List lalu untuk PERTAMA KALINYA pindah ke Kanban, cache Kanban masih kosong dan tetap
 * menampilkan "Memuat..." sekilas (baru mulus mulai kunjungan KEDUA ke Kanban). Sekarang begitu
 * SATU tab manapun berhasil fetch, hasilnya langsung dipakai mengisi cache SEMUA TIGA tab
 * sekaligus — TANPA panggilan API tambahan sama sekali (datanya sudah ada di tangan, tinggal
 * ditulis ke kunci cache lain) — supaya perpindahan tab PERTAMA KALI sekalipun sudah instan, bukan
 * cuma kunjungan berikutnya.
 *
 * `rawOpts` harus bentuk MENTAH dari GET /api/tasks/options apa adanya (JSON asli, sebelum
 * transformasi `workflow_level` (string) -> `workflowLevel` (number) yang cuma dibutuhkan Kanban
 * untuk urutan kolom/aturan drag) — fungsi ini yang menangani transformasi itu KHUSUS untuk kunci
 * cache Kanban, supaya List/Calendar (tidak butuh field itu) dan Kanban (butuh) sama-sama selalu
 * mendapat bentuk yang benar, TERLEPAS dari tab mana yang pertama kali berhasil fetch.
 */
export function primeAllTaskViewsCache(rows: unknown, rawOpts: { statuses?: Array<Record<string, unknown>> } | null | undefined): void {
  setViewCache('tasks:list:rows', rows);
  setViewCache('tasks:list:opts', rawOpts);
  setViewCache('tasks:calendar:rows', rows);
  setViewCache('tasks:calendar:opts', rawOpts);
  setViewCache('tasks:kanban:rows', rows);
  setViewCache('tasks:kanban:opts', toKanbanOptionsForCache(rawOpts));
}

/**
 * Versi ringan `primeAllTaskViewsCache` — dipakai reload RINGAN yang cuma fetch `/api/tasks`
 * (tanpa `/api/tasks/options`), misalnya `silentReloadTasksOnly` di kanban-board.tsx (dipicu
 * Time Tracking di kartu) dan `silentReloadTasksOnly` di task-detail-modal.tsx (dipicu aksi di
 * modal). Cuma menulis ulang bagian `rows` ke tiga cache tab — bagian `opts` SENGAJA tidak
 * disentuh (tidak ada data opts baru untuk ditulis, dan opts lama masih valid karena aksi-aksi
 * ini tidak pernah mengubah master data Client/Project/Task Type/Priority/Status/Assignee).
 */
export function primeAllTaskViewsRowsOnly(rows: unknown): void {
  setViewCache('tasks:list:rows', rows);
  setViewCache('tasks:calendar:rows', rows);
  setViewCache('tasks:kanban:rows', rows);
}

function toKanbanOptionsForCache(rawOpts: { statuses?: Array<Record<string, unknown>> } | null | undefined) {
  if (!rawOpts) return rawOpts;
  return {
    ...rawOpts,
    statuses: (rawOpts.statuses || []).map((s) => ({
      ...s,
      workflowLevel: s.workflow_level !== undefined && s.workflow_level !== '' ? Number(s.workflow_level) : null,
    })),
  };
}
