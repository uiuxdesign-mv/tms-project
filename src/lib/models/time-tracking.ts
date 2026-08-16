import * as SheetTable from '@/lib/google/sheet-table';
import type { SheetRow } from '@/lib/google/sheet-table';

/**
 * Time Tracking (Fase 8) — meniru spesifikasi Time Tracking di aplikasi lama:
 *
 * - Model data **append-only event log** (`task_time_logs`): tiap sesi kerja/review dicatat
 *   sebagai rentetan event `start` -> (`pause`/`resume`)* -> `stop`. State (idle/running/paused)
 *   dan durasi TIDAK disimpan sebagai kolom terpisah — semuanya di-derive dari replay event ini.
 *   `tasks.actual_duration_seconds` dipertahankan sebagai CACHE hasil replay (diperbarui tiap ada
 *   event pause/stop) supaya daftar Task/Kanban tidak perlu replay penuh hanya untuk tampil.
 *
 * - Auto status-change dua arah, memakai flag Status yang sudah ada (`is_default`, `is_review`,
 *   `is_final`) + `workflow_level` (Fase 7) — BUKAN hardcode angka level seperti di aplikasi lama
 *   (yang workflow-nya cuma 4 tahap tetap), supaya tetap konsisten dengan filosofi Status sebagai
 *   master data yang bisa dikonfigurasi bebas jumlah tahapnya:
 *     - `start` saat status = default -> otomatis maju satu tahap ke status berikutnya
 *       (`workflow_level` + 1).
 *     - `stop` saat status = "in-progress" (bukan default/review/final) -> otomatis maju ke
 *       status yang ditandai `is_review=Ya` (kalau ada dikonfigurasi admin) + otomatis membuka
 *       sesi baru dengan `is_review=Ya` untuk sesi itu.
 *     - `back` (keluar tahap review ke belakang) & `done` (keluar tahap review ke status final)
 *       sama-sama otomatis menutup sesi review yang sedang berjalan.
 *   Kalau admin tidak mengonfigurasi status manapun sebagai `is_review=Ya`, alur tetap berfungsi
 *   tanpa tahap review terpisah — `stop` cukup menutup sesi tanpa memindahkan status.
 */

export type TimeAction = 'start' | 'pause' | 'resume' | 'stop';

export type TimeLogRow = {
  id: string;
  task_id: string;
  user_id: string;
  session_no: string;
  action: TimeAction;
  is_review: string;
  occurred_at: string;
};

export type RunningState = 'idle' | 'running' | 'paused';

export type DerivedTimeState = {
  state: RunningState;
  currentSessionNo: number | null;
  currentSessionIsReview: boolean;
  /** Detik yang sudah "closed" (dari interval start/resume->pause/stop yang sudah selesai). */
  closedSeconds: number;
  /** Sama seperti closedSeconds, tapi dipecah per jenis sesi (kerja vs review) — dipakai kartu
   *  Kanban & tabel Task untuk menampilkan "Work Time" / "Review Time" terpisah seperti aplikasi lama. */
  closedWorkSeconds: number;
  closedReviewSeconds: number;
  /** Timestamp ISO event start/resume terakhir kalau sedang running — dipakai client untuk live-ticking. */
  liveSince: string | null;
};

async function getEventsForTask(taskId: string, opts: { useCache?: boolean } = {}): Promise<TimeLogRow[]> {
  const rows = await SheetTable.getAll('task_time_logs', opts);
  return (rows as unknown as TimeLogRow[])
    .filter((r) => r.task_id === taskId)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || Number(a.session_no) - Number(b.session_no));
}

/**
 * Replay event log satu task jadi state saat ini + akumulasi durasi "closed" (belum termasuk
 * waktu berjalan sejak event start/resume terakhir kalau sedang running — itu dihitung live di
 * client dari `liveSince`, supaya tidak perlu polling server tiap detik).
 */
export function deriveState(events: TimeLogRow[]): DerivedTimeState {
  let closedSeconds = 0;
  let closedWorkSeconds = 0;
  let closedReviewSeconds = 0;
  let openSince: string | null = null; // occurred_at dari start/resume terakhir yang belum ditutup pause/stop
  let openIsReview = false; // flag is_review dari event start/resume yang membuka sesi openSince di atas
  let currentSessionNo: number | null = null;
  let currentSessionIsReview = false;
  let state: RunningState = 'idle';

  for (const ev of events) {
    const sessionNo = Number(ev.session_no);
    if (ev.action === 'start') {
      openSince = ev.occurred_at;
      openIsReview = ev.is_review === 'Ya';
      currentSessionNo = sessionNo;
      currentSessionIsReview = openIsReview;
      state = 'running';
    } else if (ev.action === 'resume') {
      openSince = ev.occurred_at;
      openIsReview = ev.is_review === 'Ya';
      currentSessionNo = sessionNo;
      currentSessionIsReview = openIsReview;
      state = 'running';
    } else if (ev.action === 'pause') {
      if (openSince) {
        const secs = secondsBetween(openSince, ev.occurred_at);
        closedSeconds += secs;
        if (openIsReview) closedReviewSeconds += secs;
        else closedWorkSeconds += secs;
      }
      openSince = null;
      currentSessionNo = sessionNo;
      currentSessionIsReview = ev.is_review === 'Ya';
      state = 'paused';
    } else if (ev.action === 'stop') {
      if (openSince) {
        const secs = secondsBetween(openSince, ev.occurred_at);
        closedSeconds += secs;
        if (openIsReview) closedReviewSeconds += secs;
        else closedWorkSeconds += secs;
      }
      openSince = null;
      currentSessionNo = null;
      currentSessionIsReview = false;
      state = 'idle';
    }
  }

  return {
    state,
    currentSessionNo,
    currentSessionIsReview,
    closedSeconds,
    closedWorkSeconds,
    closedReviewSeconds,
    liveSince: state === 'running' ? openSince : null,
  };
}

function secondsBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return ms > 0 ? Math.round(ms / 1000) : 0;
}

function nextSessionNo(events: TimeLogRow[]): number {
  return events.reduce((max, e) => Math.max(max, Number(e.session_no) || 0), 0) + 1;
}

type StatusRow = SheetRow;

async function getStatusesSorted(): Promise<StatusRow[]> {
  const rows = await SheetTable.getAll('statuses');
  return rows
    .filter((s) => s.workflow_level !== '')
    .sort((a, b) => Number(a.workflow_level) - Number(b.workflow_level));
}

/**
 * Status "Cancelled" (Fase 19) — sama definisinya dengan yang dipakai UI (handleCancelTask di
 * task-detail-modal.tsx): status final TANPA `workflow_level` (sengaja dikecualikan dari urutan
 * linear supaya bisa dituju dari status manapun, persis seperti Cancelled di aplikasi lama).
 */
async function getCancelStatus(): Promise<StatusRow | undefined> {
  const rows = await SheetTable.getAll('statuses');
  return rows.find((s) => s.is_final === 'Ya' && s.workflow_level === '');
}

/**
 * Entri riwayat yang DIKUMPULKAN dulu, baru ditulis belakangan (asal-usul: permintaan user poin 2
 * Round 20 — "aksi ... masih sering lama merespon, bahkan sering error"): tiap perubahan status/
 * aksi Jeda-Lanjutkan di runTimeAction TIDAK langsung `await logTaskChange(...)`/
 * `await logTimeTrackingHistory(...)` di tengah alur (yang berarti 1+ penulisan Google Sheets
 * TAMBAHAN (task_history) SERIAL sebelum response bisa dikirim, di atas penulisan-penulisan lain
 * yang sudah wajib seperti task_time_logs & tasks.status_id/actual_duration_seconds) — cukup
 * `queueStatusHistory(...)`/`queuePauseResumeHistory(...)` (operasi sinkron, push ke array, TIDAK
 * ada I/O). Array ini disisipkan ke TimeActionResult, lalu route handler
 * (POST /api/tasks/[id]/time-tracking) yang benar-benar menuliskannya ke Google Sheets.
 *
 * PERBAIKAN Round 21 (poin 1 — "aktivitas history nya tidak langsung muncul, ketika di refresh
 * baru muncul"): di Round 20 penulisan riwayat ini sempat dibungkus `after()` (Next.js) supaya
 * jalan SETELAH response dikirim ke client — tapi ini menciptakan race dengan Activity feed:
 * client menerima response sukses lalu langsung refetch tab Aktivitas (lewat refreshToken/
 * polling), padahal penulisan task_history di belakang layar belum tentu selesai duluan, sehingga
 * entri baru cuma muncul di refetch BERIKUTNYA. Sekarang route handler-nya `await` array ini
 * SEBELUM mengirim response (lihat route.ts) — dijamin task_history sudah lengkap begitu client
 * menerima jawaban sukses, konsisten dengan Activity feed yang langsung ditarik ulang setelahnya.
 * Pola "kumpulkan ke array dulu" tetap dipertahankan (bukan balik ke `await` inline di setiap call
 * site) karena tetap menyederhanakan kode call site & tidak mengubah urutan penulisan wajib
 * lainnya — cuma titik EKSEKUSI-nya yang dipindah dari "setelah response" jadi "sebelum response".
 */
type PendingHistoryEntry = {
  changeType: 'status' | 'time_tracking';
  fieldKey: string;
  oldValueLabel: string;
  newValueLabel: string;
  changedBy: string;
};

/** Antre 1 entri riwayat perubahan STATUS (permintaan user poin 4 — round sebelumnya). Kedua
 *  StatusRow (lama & baru) sudah tersedia di tiap call site tanpa fetch tambahan. */
function queueStatusHistory(
  pending: PendingHistoryEntry[],
  userId: string,
  oldStatus: StatusRow | undefined,
  newStatus: StatusRow | undefined
) {
  pending.push({
    changeType: 'status',
    fieldKey: 'status_id',
    oldValueLabel: oldStatus?.status_name || '',
    newValueLabel: newStatus?.status_name || '',
    changedBy: userId,
  });
}

/** Antre 1 entri riwayat aksi Jeda/Lanjutkan (permintaan user poin 1 — round ini). */
function queuePauseResumeHistory(pending: PendingHistoryEntry[], userId: string, action: 'pause' | 'resume') {
  pending.push({
    changeType: 'time_tracking',
    fieldKey: action,
    oldValueLabel: '',
    newValueLabel: '',
    changedBy: userId,
  });
}

export type TimeActionResult =
  | { ok: true; task: SheetRow; events: TimeLogRow[]; state: DerivedTimeState; pendingHistory: PendingHistoryEntry[] }
  | { ok: false; error: string };

/**
 * Perbaikan (permintaan user, item concurrency — "beberapa user secara bersamaan tidak sengaja
 * melakukan action yang sama secara bersamaan"): runTimeAction membaca state (replay event log),
 * memvalidasinya, LALU baru menulis — ada jendela waktu ("read-check-write") di mana 2 request
 * bersamaan untuk task yang SAMA bisa sama-sama membaca state lama sebelum salah satu sempat
 * menulis, sehingga validasi "sudah berjalan/tidak" di keduanya lolos dan keduanya menulis event
 * duplikat (mis. dua kali "start", atau status ter-advance dua kali). Sekarang aksi untuk task_id
 * yang sama diserialisasi (antrean FIFO in-process) — request kedua menunggu request pertama
 * benar-benar selesai (termasuk semua tulisannya) sebelum mulai membaca state, sehingga validasi
 * state-nya selalu terhadap data TERBARU, bukan data basi.
 *
 * CATATAN keterbatasan: lock ini in-memory per instance server, jadi HANYA menutup race kalau
 * kedua request kebetulan dilayani instance serverless yang sama (skenario paling umum untuk
 * traffic rendah-menengah). Untuk jaminan lintas-instance yang benar-benar mutlak dibutuhkan lock
 * terdistribusi (mis. Redis/Upstash/Vercel KV) — di luar cakupan perbaikan ini, silakan diskusikan
 * kalau traffic aplikasi sudah cukup besar untuk butuh itu.
 */
const taskLocks = new Map<string, Promise<void>>();

async function withTaskLock<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
  const tail = taskLocks.get(taskId) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const newTail = tail.then(() => gate);
  taskLocks.set(taskId, newTail);

  await tail; // tunggu giliran (pemegang lock sebelumnya, kalau ada, selesai dulu)
  try {
    return await fn();
  } finally {
    release();
    // Bersihkan entri map kalau tidak ada antrean lain menumpuk di belakang kita (cegah memory leak).
    if (taskLocks.get(taskId) === newTail) taskLocks.delete(taskId);
  }
}

/**
 * Jalankan satu aksi Time Tracking (`start`/`pause`/`resume`/`stop`/`back`/`done`) untuk sebuah
 * task, dengan validasi no-op server-side (aksi yang tidak sesuai state saat ini ditolak, bukan
 * di-silent-ignore) dan efek samping auto status-change sesuai dokumentasi di atas modul ini.
 */
export async function runTimeAction(
  taskId: string,
  userId: string,
  action: 'start' | 'pause' | 'resume' | 'stop' | 'back' | 'done' | 'cancel'
): Promise<TimeActionResult> {
  return withTaskLock(taskId, () => runTimeActionLocked(taskId, userId, action));
}

async function runTimeActionLocked(
  taskId: string,
  userId: string,
  action: 'start' | 'pause' | 'resume' | 'stop' | 'back' | 'done' | 'cancel'
): Promise<TimeActionResult> {
  const taskRow = await SheetTable.findById('tasks', taskId);
  if (!taskRow) return { ok: false, error: 'Task tidak ditemukan.' };
  const task: SheetRow = taskRow;

  const status = task.status_id ? await SheetTable.findById('statuses', task.status_id) : undefined;
  if (!status) return { ok: false, error: 'Status task tidak valid.' };

  const isDefault = status.is_default === 'Ya';
  const isReview = status.is_review === 'Ya';
  const isFinal = status.is_final === 'Ya';

  const events = await getEventsForTask(taskId);
  const derived = deriveState(events);

  // Riwayat perubahan (status & aksi Jeda/Lanjutkan) DIKUMPULKAN di sini dulu (lihat catatan
  // panjang di PendingHistoryEntry/queueStatusHistory di atas), BUKAN langsung ditulis ke Google
  // Sheets di tengah alur — supaya tidak menambah latensi respons Time Tracking.
  const pending: PendingHistoryEntry[] = [];

  async function logEvent(sessionNo: number, ev: TimeAction, reviewFlag: boolean, occurredAt: string) {
    await SheetTable.insertRow('task_time_logs', {
      task_id: taskId,
      user_id: userId,
      session_no: String(sessionNo),
      action: ev,
      is_review: reviewFlag ? 'Ya' : 'Tidak',
      occurred_at: occurredAt,
    });
  }

  async function persistDuration(extraClosedSeconds: number) {
    const currentTotal = Number(task.actual_duration_seconds || 0);
    await SheetTable.updateRow('tasks', taskId, {
      actual_duration_seconds: String(currentTotal + extraClosedSeconds),
    });
  }

  if (isFinal) {
    return { ok: false, error: 'Task sudah di status akhir — Time Tracking tidak bisa diubah lagi.' };
  }

  if (action === 'start') {
    if (isReview) return { ok: false, error: 'Task sedang di tahap review — pakai tombol Back/Done.' };
    if (derived.state !== 'idle') return { ok: false, error: 'Sesi sudah berjalan — tidak bisa Start lagi.' };

    const now = new Date().toISOString();
    const sessionNo = nextSessionNo(events);
    await logEvent(sessionNo, 'start', false, now);

    if (isDefault) {
      const advanced = await advanceToNextStatus(task, status, userId, pending);
      if (!advanced.ok) return advanced;
    }
    return finish(taskId, pending);
  }

  if (action === 'pause') {
    if (derived.state !== 'running') return { ok: false, error: 'Tidak ada sesi yang sedang berjalan untuk di-pause.' };
    const now = new Date().toISOString();
    await logEvent(derived.currentSessionNo!, 'pause', derived.currentSessionIsReview, now);
    await persistDuration(secondsBetween(derived.liveSince!, now));
    // Permintaan user poin 1: catat aksi Jeda ke Aktivitas/riwayat task.
    queuePauseResumeHistory(pending, userId, 'pause');
    return finish(taskId, pending);
  }

  if (action === 'resume') {
    if (derived.state !== 'paused') return { ok: false, error: 'Tidak ada sesi yang di-pause untuk di-resume.' };
    const now = new Date().toISOString();
    await logEvent(derived.currentSessionNo!, 'resume', derived.currentSessionIsReview, now);
    // Permintaan user poin 1: catat aksi Lanjutkan ke Aktivitas/riwayat task.
    queuePauseResumeHistory(pending, userId, 'resume');
    return finish(taskId, pending);
  }

  if (action === 'stop') {
    if (isReview) return { ok: false, error: 'Task sedang di tahap review — pakai tombol Back/Done.' };
    if (derived.state === 'idle') return { ok: false, error: 'Tidak ada sesi yang berjalan untuk di-stop.' };

    const now = new Date().toISOString();
    const closingSessionNo = derived.currentSessionNo!;
    await logEvent(closingSessionNo, 'stop', derived.currentSessionIsReview, now);
    if (derived.state === 'running') await persistDuration(secondsBetween(derived.liveSince!, now));

    const statuses = await getStatusesSorted();
    const reviewStatus = statuses.find((s) => s.is_review === 'Ya');
    if (reviewStatus) {
      await SheetTable.updateRow('tasks', taskId, { status_id: reviewStatus.id });
      queueStatusHistory(pending, userId, status, reviewStatus);
      // Otomatis buka sesi review baru begitu masuk tahap review (spesifikasi Time Tracking).
      await logEvent(closingSessionNo + 1, 'start', true, now);
    }
    return finish(taskId, pending);
  }

  if (action === 'back') {
    if (!isReview) return { ok: false, error: 'Task tidak sedang di tahap review.' };
    if (derived.state === 'idle') {
      // Sesi review seharusnya selalu terbuka otomatis saat masuk review; kalau ternyata idle
      // (mis. data lama sebelum Fase 8), tetap izinkan pindah status mundur tanpa menutup sesi.
    } else {
      const now = new Date().toISOString();
      await logEvent(derived.currentSessionNo!, 'stop', true, now);
      if (derived.state === 'running') await persistDuration(secondsBetween(derived.liveSince!, now));
    }

    const statuses = await getStatusesSorted();
    const currentLevel = Number(status.workflow_level);
    const previous = statuses.filter((s) => Number(s.workflow_level) < currentLevel).pop();
    if (!previous) return { ok: false, error: 'Tidak ada status sebelumnya untuk kembali (Back).' };
    await SheetTable.updateRow('tasks', taskId, { status_id: previous.id });
    queueStatusHistory(pending, userId, status, previous);
    return finish(taskId, pending);
  }

  if (action === 'done') {
    if (!isReview) return { ok: false, error: 'Task tidak sedang di tahap review.' };
    const now = new Date().toISOString();
    if (derived.state !== 'idle') {
      await logEvent(derived.currentSessionNo!, 'stop', true, now);
      if (derived.state === 'running') await persistDuration(secondsBetween(derived.liveSince!, now));
    }

    const statuses = await getStatusesSorted();
    const currentLevel = Number(status.workflow_level);
    const finalStatus =
      statuses.find((s) => s.is_final === 'Ya' && Number(s.workflow_level) > currentLevel) ||
      statuses.find((s) => s.is_final === 'Ya');
    if (!finalStatus) return { ok: false, error: 'Tidak ada status akhir (is_final) yang dikonfigurasi.' };
    if (!task.assigned_to) {
      return { ok: false, error: 'Status akhir wajib memiliki assignee.' };
    }

    await SheetTable.updateRow('tasks', taskId, {
      status_id: finalStatus.id,
      completed_at: task.completed_at || now,
    });
    queueStatusHistory(pending, userId, status, finalStatus);
    return finish(taskId, pending);
  }

  if (action === 'cancel') {
    // Fase 19 (permintaan user, spec Kanban & Time Tracking §7): "Cancel" boleh dipakai dari status
    // manapun yang BELUM final (To Do/In Progress/In Review — sudah dijamin oleh guard `isFinal` di
    // atas fungsi ini). Sebelumnya tombol "Cancel Task" di UI langsung PATCH status_id mentah TANPA
    // lewat runTimeAction sama sekali — akibatnya sesi Time Tracking yang sedang berjalan/di-pause
    // tidak pernah ditutup (jadi "menggantung": Work/Review Time yang sudah lewat tidak
    // ter-persist, dan History Log tidak mencatat kapan sesi itu berhenti). Sekarang: tutup dulu
    // sesi yang masih terbuka (running/paused) dengan event `stop` biasa — SAMA seperti aksi
    // Stop/Done menutup sesi — baru pindahkan status ke Cancelled.
    const now = new Date().toISOString();
    if (derived.state !== 'idle') {
      await logEvent(derived.currentSessionNo!, 'stop', derived.currentSessionIsReview, now);
      if (derived.state === 'running') await persistDuration(secondsBetween(derived.liveSince!, now));
    }

    const cancelStatus = await getCancelStatus();
    if (!cancelStatus) {
      return { ok: false, error: 'Tidak ada status "Cancelled" (final tanpa Urutan Workflow) yang dikonfigurasi di Master Status.' };
    }

    await SheetTable.updateRow('tasks', taskId, {
      status_id: cancelStatus.id,
      completed_at: task.completed_at || now,
    });
    queueStatusHistory(pending, userId, status, cancelStatus);
    return finish(taskId, pending);
  }

  return { ok: false, error: 'Aksi tidak dikenal.' };
}

async function advanceToNextStatus(
  task: SheetRow,
  currentStatus: StatusRow,
  userId: string,
  pending: PendingHistoryEntry[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const statuses = await getStatusesSorted();
  const currentLevel = Number(currentStatus.workflow_level);
  const next = statuses.find((s) => Number(s.workflow_level) === currentLevel + 1);
  if (!next) return { ok: false, error: 'Tidak ada status berikutnya (workflow_level+1) untuk maju.' };
  await SheetTable.updateRow('tasks', task.id, { status_id: next.id });
  queueStatusHistory(pending, userId, currentStatus, next);
  return { ok: true };
}

async function finish(taskId: string, pendingHistory: PendingHistoryEntry[]): Promise<TimeActionResult> {
  const task = await SheetTable.findById('tasks', taskId);
  if (!task) return { ok: false, error: 'Task tidak ditemukan setelah update.' };
  const events = await getEventsForTask(taskId);
  const state = deriveState(events);
  return { ok: true, task, events, state, pendingHistory };
}

/**
 * Dipakai UI untuk menghitung "closedSeconds" total (sudah termasuk cache
 * tasks.actual_duration_seconds).
 *
 * Perbaikan (Round 22, permintaan user poin 5 — "membuka modal tasking sangat lama menampilkan
 * data"): dua perbaikan sekaligus di sini —
 * (1) `preFetchedTask` (opsional): caller yang KEBETULAN sudah punya baris task ini di tangan
 *     (mis. GET /api/tasks/[id]/time-tracking, yang sudah `findById('tasks', id)` sendiri untuk
 *     cek izin SEBELUM memanggil fungsi ini) bisa mengoper baris itu langsung supaya fungsi ini
 *     TIDAK perlu baca ulang sheet `tasks` dari Google Sheets API — sebelumnya SELALU baca ulang
 *     walau task-nya sudah ada di tangan caller, jadi 1 panggilan API yang benar-benar tidak
 *     perlu di setiap pembukaan modal Task (dipanggil PARALEL dengan GET /api/tasks/[id] yang
 *     JUGA baca sheet `tasks` yang sama — di deployment serverless multi-instance seperti
 *     Vercel, dedup single-flight di sheet-table.ts tidak selalu bisa menyatukan 2 request HTTP
 *     terpisah ini kalau kebetulan dilayani instance berbeda).
 * (2) Kalau memang perlu baca task dari sheet (tidak ada preFetchedTask), pembacaan itu
 *     dijalankan BERSAMAAN (Promise.all) dengan pembacaan event log `task_time_logs` — sebelumnya
 *     berurutan, padahal keduanya independen.
 */
export async function getTimeStateForTask(
  taskId: string,
  opts: { useCache?: boolean; preFetchedTask?: SheetRow } = {}
): Promise<{ task: SheetRow | undefined; state: DerivedTimeState; events: TimeLogRow[] }> {
  const [task, events] = await Promise.all([
    opts.preFetchedTask ? Promise.resolve(opts.preFetchedTask) : SheetTable.findById('tasks', taskId, opts),
    getEventsForTask(taskId, opts),
  ]);
  const state = deriveState(events);
  return { task, state, events };
}

/**
 * Versi batch dari deriveState — dipakai daftar Task/Kanban supaya tidak perlu 1 request
 * terpisah per task hanya untuk tahu state Time Tracking-nya. Cuma 1 kali baca sheet
 * `task_time_logs` (kena cache 30 detik yang sama seperti sheet lain), lalu di-replay per task.
 */
export async function getTimeStatesForTasks(
  taskIds: string[],
  opts: { useCache?: boolean } = {}
): Promise<Record<string, DerivedTimeState>> {
  const idSet = new Set(taskIds);
  let allEvents: TimeLogRow[];
  try {
    allEvents = (await SheetTable.getAll('task_time_logs', opts)) as unknown as TimeLogRow[];
  } catch {
    // Sheet `task_time_logs` belum dikonfigurasi (mis. SHEET_ID_TASK_TIME_LOGS belum diset saat
    // deploy) — daripada bikin seluruh daftar Task/Kanban/Calendar 500, degradasi ke "idle" untuk
    // semua task supaya modul Tasking tetap bisa dipakai (tanpa data Time Tracking) sampai admin
    // menyelesaikan setup sheet-nya.
    const idleFallback: DerivedTimeState = {
      state: 'idle',
      currentSessionNo: null,
      currentSessionIsReview: false,
      closedSeconds: 0,
      closedWorkSeconds: 0,
      closedReviewSeconds: 0,
      liveSince: null,
    };
    return Object.fromEntries(taskIds.map((id) => [id, idleFallback]));
  }
  const byTask = new Map<string, TimeLogRow[]>();
  for (const ev of allEvents) {
    if (!idSet.has(ev.task_id)) continue;
    const list = byTask.get(ev.task_id) || [];
    list.push(ev);
    byTask.set(ev.task_id, list);
  }
  const result: Record<string, DerivedTimeState> = {};
  for (const taskId of taskIds) {
    const events = (byTask.get(taskId) || []).sort(
      (a, b) => a.occurred_at.localeCompare(b.occurred_at) || Number(a.session_no) - Number(b.session_no)
    );
    result[taskId] = deriveState(events);
  }
  return result;
}
