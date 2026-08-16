import { getSession } from '@/lib/auth/get-session';
import { getVisibleMenuKeys } from '@/lib/menu-access/permissions';
import { getVisibleEnrichedTasks } from '@/lib/models/reports';
import { summarizeTasks } from '@/lib/reports/summarize';
import { getRecentCommentsForTasks, type CommentRow } from '@/lib/models/comments';
import { getAuditLog, type AuditLogEntry } from '@/lib/models/audit-log';
import * as SheetTable from '@/lib/google/sheet-table';
import { computeClosedIntervals, type TimeLogEventLike } from '@/lib/reports/time-intervals';
import { elapsedWeekdaysThisWeek, rangeBounds } from '@/lib/reports/date-range';
import type { ClosedTimeInterval } from '@/lib/reports/types';
import DashboardView from '@/components/dashboard-view';
import AutoRefresh from '@/components/auto-refresh';

export default async function DashboardPage() {
  const session = await getSession();
  const isAdmin = !!session?.isAdmin;

  // Bugfix (permintaan user, item reliability): kedua pemanggilan ini SEBELUMNYA tidak dibungkus
  // try/catch, padahal jalan di SETIAP pembukaan Dashboard (Server Component, SSR) — begitu
  // Google Sheets API gagal sesaat (rate limit 429, hiccup jaringan) setelah retry di
  // sheet-table.ts tetap habis, exception yang tidak tertangani membuat Next.js menampilkan
  // halaman error generik ("This page couldn't load — A server error occurred"), BUKAN pesan
  // yang jelas seperti bagian lain di Dashboard ini (komentar/time tracking/audit log semuanya
  // sudah graceful-degradation lewat try/catch). Sekarang disamakan: kalau gagal, anggap saja
  // "tidak ada akses/tidak ada data" untuk render kali ini — user tinggal refresh, bukan disambut
  // layar error mentah.
  //
  // Perbaikan (Round 22, permintaan user poin 3 & 4 — "klik menu dashboard responya lama" &
  // "pengambilan data ... lebih efisien"): "Aktivitas Terbaru" (Audit Log, admin-only) SAMA SEKALI
  // tidak butuh tahu izin menu Tasking/Report — independen dari getVisibleMenuKeys.
  //
  // Perbaikan susulan (Round 25 — permintaan user, ditemukan lewat video rekaman layar "klik menu
  // dashboard masih terjadi delay"): Round 22 SEBELUMNYA menggabungkan kedua pemanggilan ini lewat
  // SATU `Promise.all` yang di-`await` bersama — kelihatannya sudah paralel, TAPI ini masih
  // menyembunyikan hambatan: baris `const [visibleKeys, recentActivity] = await Promise.all(...)`
  // tetap BARU selesai setelah KEDUANYA selesai (termasuk audit_log, 1 sheet penuh), padahal yang
  // benar-benar dibutuhkan SEGERA di bawah cuma `visibleKeys` (untuk tahu `canViewTasking`, yang
  // jadi syarat mulainya Stage 2 di bawah — pengambilan 10 sheet tasks/users/comments/timelogs,
  // BAGIAN TERBERAT & PALING LAMA di halaman ini). Artinya Stage 2 yang berat itu jadi menunggu
  // audit_log kelar dulu TANPA ALASAN, padahal audit_log baru benar-benar dipakai jauh di bawah
  // (props `recentActivity` ke DashboardView). Sekarang audit_log dijadikan Promise TERPISAH yang
  // mulai jalan di latar belakang dari baris ini juga, TAPI TIDAK di-`await` di sini — baru
  // di-`await` di titik pemakaiannya (dekat `return` di bawah). Hasilnya: Stage 2 bisa mulai
  // secepat `getVisibleMenuKeys` selesai saja (untuk Admin malah INSTAN, lihat
  // `getVisibleMenuKeys` di lib/menu-access/permissions.ts — admin langsung dapat semua menu key
  // tanpa fetch apa pun ke Google Sheets sama sekali), bukan menunggu audit_log yang tidak ada
  // hubungannya sama sekali.
  const recentActivityPromise: Promise<AuditLogEntry[]> = isAdmin
    ? getAuditLog()
        .then((rows) => rows.slice(0, 6))
        .catch((e) => {
          console.error('[dashboard] gagal memuat audit log:', e);
          return [] as AuditLogEntry[];
        })
    : Promise.resolve([] as AuditLogEntry[]);

  const visibleKeys = session
    ? await getVisibleMenuKeys(session).catch((e) => {
        console.error('[dashboard] gagal memuat menu access:', e);
        return new Set<string>();
      })
    : new Set<string>();
  const canViewTasking = visibleKeys.has('tasking');
  const canViewReport = visibleKeys.has('report');

  // Perbaikan (Round 23, permintaan user "klik menu dashboard masih sangat lama"): SEBELUMNYA ada
  // 2 tahap round-trip yang SALING MENUNGGU padahal tidak perlu — (1) getVisibleEnrichedTasks
  // (gabungan 7 sheet, paling berat di halaman ini) harus SELESAI DULU sebelum (2) baru mulai
  // ambil users/task_comments/task_time_logs (3 sheet lagi), karena kode lama pikir langkah (2)
  // butuh `visibleTaskIds` dari hasil (1). Padahal FETCH mentah ketiga sheet itu (SheetTable.getAll)
  // sama sekali TIDAK butuh tahu taskIds lebih dulu — taskIds cuma dipakai untuk MENYARING hasilnya
  // setelah data sudah di tangan (lihat getRecentCommentsForTasks & filter events di bawah).
  // Sekarang SEMUA 4 sheet (tasks + users + task_comments + task_time_logs) diambil BERSAMAAN lewat
  // satu Promise.all — total waktu tunggu Dashboard turun dari "waktu(1) + waktu(2)" jadi cuma
  // waktu PALING LAMBAT di antara semuanya (potensi ~2x lebih cepat pada kondisi cache dingin).
  // Trade-off kecil yang disengaja: 3 sheet users/task_comments/task_time_logs sekarang tetap
  // diambil meski ternyata visibleTasks hasilnya 0 baris (kasus jarang — user dengan akses Tasking
  // tapi belum ada task apa pun yang visible untuknya) — dibanding penghematan latensi untuk kasus
  // NORMAL (mayoritas user yang memang punya task), ini trade-off yang sepadan, konsisten dengan
  // pola paralelisasi lain di Round 22/23.
  let visibleTasks: Awaited<ReturnType<typeof getVisibleEnrichedTasks>> = [];
  let usersResult: SheetTable.SheetRow[] = [];
  let commentsRawResult: SheetTable.SheetRow[] = [];
  let timeLogsResult: SheetTable.SheetRow[] = [];
  if (session && canViewTasking) {
    [visibleTasks, usersResult, commentsRawResult, timeLogsResult] = await Promise.all([
      getVisibleEnrichedTasks(session).catch((e) => {
        console.error('[dashboard] gagal memuat tasks:', e);
        return [] as Awaited<ReturnType<typeof getVisibleEnrichedTasks>>;
      }),
      SheetTable.getAll('users').catch(() => [] as SheetTable.SheetRow[]),
      SheetTable.getAll('task_comments').catch(() => [] as SheetTable.SheetRow[]),
      SheetTable.getAll('task_time_logs').catch(() => [] as SheetTable.SheetRow[]),
    ]);
  }
  const summary = session && canViewTasking ? summarizeTasks(visibleTasks) : null;

  // Feed "Tugas Jatuh Tempo Segera" — 14 hari ke depan, belum final, urut tanggal jatuh tempo
  // terdekat dulu.
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const in14Str = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcomingDue = visibleTasks
    .filter((t) => !t.is_final && t.due_date && t.due_date >= todayStr && t.due_date <= in14Str)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  const taskTitleById = new Map(visibleTasks.map((t) => [t.id, t.title]));

  // Perbaikan (Round 22, permintaan user poin 3 & 4 — "klik menu dashboard responya lama" &
  // "pengambilan data ... lebih efisien"): nama user, komentar terbaru, & interval Time Tracking
  // SALING INDEPENDEN satu sama lain — tidak ada satu pun yang butuh hasil dari yang lain.
  // Perbaikan susulan (Round 23 — permintaan user "klik menu dashboard masih sangat lama"):
  // `usersResult`/`commentsRawResult`/`timeLogsResult` SEKARANG SUDAH di-fetch di atas, BERSAMAAN
  // dengan `getVisibleEnrichedTasks` (lihat catatan panjang di deklarasi variabel tsb) — blok ini
  // TIDAK fetch apa pun lagi, cuma memproses data yang sudah di tangan (filter berdasarkan
  // visibleTaskIds, hitung interval, dst). Ini menghilangkan 1 round-trip penuh yang sebelumnya
  // WAJIB menunggu getVisibleEnrichedTasks selesai dulu sebelum baru mulai fetch ketiga sheet ini.
  let userNames = new Map<string, string>();
  let recentComments: Awaited<ReturnType<typeof getRecentCommentsForTasks>> = [];
  let timeIntervals: ClosedTimeInterval[] = [];
  let hoursWorkedTodayHours = 0;
  let weeklyProductivityPct = 0;
  let recentTimeTracking: ClosedTimeInterval[] = [];

  if (session && canViewTasking && visibleTasks.length > 0) {
    const visibleTaskIds = visibleTasks.map((t) => t.id);

    userNames = new Map(usersResult.map((u) => [u.id, u.name]));
    // Fase 9: feed "Komentar Terbaru" — hanya dari task yang visible ke session ini (aturan
    // visibilitas yang sama seperti daftar Tasks). `preFetchedRows` supaya tidak fetch ulang sheet
    // task_comments yang sudah diambil bersamaan tasks di atas (lihat catatan Round 23 di sana).
    recentComments = await getRecentCommentsForTasks(visibleTaskIds, 5, {
      preFetchedRows: commentsRawResult as CommentRow[],
    }).catch(() => []);

    try {
      const visibleIds = new Set(visibleTaskIds);
      const events = (timeLogsResult as unknown as TimeLogEventLike[]).filter((ev) => visibleIds.has(ev.task_id));
      const closed = computeClosedIntervals(events);

      timeIntervals = closed.map((iv) => ({
        taskId: iv.taskId,
        taskTitle: taskTitleById.get(iv.taskId) || '',
        userId: iv.userId,
        userName: userNames.get(iv.userId) || 'User',
        startedAt: iv.startedAt,
        endedAt: iv.endedAt,
        seconds: iv.seconds,
      }));

      const { start: weekStart, end: weekEnd } = rangeBounds('week');
      const mySeconds = (predicate: (iv: ClosedTimeInterval) => boolean) =>
        timeIntervals.filter((iv) => iv.userId === session.userId && predicate(iv)).reduce((sum, iv) => sum + iv.seconds, 0);

      const todaySeconds = mySeconds((iv) => iv.startedAt.slice(0, 10) === todayStr);
      hoursWorkedTodayHours = todaySeconds / 3600;

      const weekSeconds = mySeconds((iv) => {
        const d = iv.startedAt.slice(0, 10);
        return d >= weekStart && d <= weekEnd;
      });
      const expectedWeekSeconds = elapsedWeekdaysThisWeek() * 8 * 3600;
      weeklyProductivityPct = Math.min(100, Math.round((weekSeconds / expectedWeekSeconds) * 100));

      recentTimeTracking = [...timeIntervals].sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, 5);
    } catch {
      timeIntervals = [];
      hoursWorkedTodayHours = 0;
      weeklyProductivityPct = 0;
      recentTimeTracking = [];
    }
  }
  const commentUserNames = userNames;

  // Baru di-`await` di sini (lihat catatan Round 25 di atas) — pada titik ini Stage 2 di atas
  // (tasks/users/comments/timelogs, jauh lebih berat) sudah pasti selesai duluan, jadi
  // `recentActivityPromise` (yang sudah jalan di latar belakang sejak awal fungsi ini) HAMPIR
  // SELALU sudah selesai sendiri saat baris ini dijalankan — praktis tidak menambah waktu tunggu.
  const recentActivity = await recentActivityPromise;

  return (
    <>
      <AutoRefresh />
      <DashboardView
      session={
        session
          ? {
              name: session.name,
              email: session.email,
              roleName: session.roleName,
              roleKey: session.roleKey,
              canAssignOthers: session.canAssignOthers,
            }
          : null
      }
      isAdmin={isAdmin}
      canViewTasking={canViewTasking}
      canViewReport={canViewReport}
      summary={summary}
      tasks={visibleTasks}
      timeIntervals={timeIntervals}
      hoursWorkedTodayHours={hoursWorkedTodayHours}
      weeklyProductivityPct={weeklyProductivityPct}
      upcomingDue={upcomingDue}
      recentComments={recentComments}
      commentUserNames={Object.fromEntries(commentUserNames)}
      taskTitleById={Object.fromEntries(taskTitleById)}
      recentActivity={recentActivity}
      recentTimeTracking={recentTimeTracking}
      />
    </>
  );
}
