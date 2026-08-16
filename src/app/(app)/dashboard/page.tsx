import { getSession } from '@/lib/auth/get-session';
import { getVisibleMenuKeys } from '@/lib/menu-access/permissions';
import { getVisibleEnrichedTasks } from '@/lib/models/reports';
import { summarizeTasks } from '@/lib/reports/summarize';
import { getRecentCommentsForTasks } from '@/lib/models/comments';
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
  // tidak butuh tahu izin menu Tasking/Report — sebelumnya baru mulai diambil setelah menunggu
  // getVisibleMenuKeys selesai (di bagian bawah halaman ini), padahal keduanya independen.
  // Sekarang dijalankan BERSAMAAN lewat Promise.all supaya tidak menambah waktu tunggu tambahan
  // untuk admin (yang paling sering membuka Dashboard ini).
  const [visibleKeys, recentActivity] = await Promise.all([
    session
      ? getVisibleMenuKeys(session).catch((e) => {
          console.error('[dashboard] gagal memuat menu access:', e);
          return new Set<string>();
        })
      : Promise.resolve(new Set<string>()),
    isAdmin
      ? getAuditLog()
          .then((rows) => rows.slice(0, 6))
          .catch((e) => {
            console.error('[dashboard] gagal memuat audit log:', e);
            return [] as AuditLogEntry[];
          })
      : Promise.resolve([] as AuditLogEntry[]),
  ]);
  const canViewTasking = visibleKeys.has('tasking');
  const canViewReport = visibleKeys.has('report');

  // Ringkasan & chart tugas di Dashboard hanya relevan kalau user memang punya akses Tasking
  // (Fase 7) — sebelumnya selalu dihitung untuk siapa saja yang login, meski Tasking sekarang
  // digerbang.
  let visibleTasks: Awaited<ReturnType<typeof getVisibleEnrichedTasks>> = [];
  if (session && canViewTasking) {
    try {
      visibleTasks = await getVisibleEnrichedTasks(session);
    } catch (e) {
      console.error('[dashboard] gagal memuat tasks:', e);
    }
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
  // "pengambilan data ... lebih efisien"): ketiga blok data di bawah ini (nama user, komentar
  // terbaru, interval Time Tracking) SEBELUMNYA di-fetch satu per satu secara BERURUTAN (users ->
  // baru comments -> baru task_time_logs), padahal ketiganya SALING INDEPENDEN — sama-sama cuma
  // butuh `visibleTasks` yang sudah tersedia di atas, tidak ada satu pun yang butuh hasil dari
  // yang lain sebelum bisa mulai. Sekarang ketiganya dijalankan BERSAMAAN lewat Promise.all —
  // total waktu tunggu jadi sepanjang yang PALING LAMBAT dari ketiganya, bukan jumlah ketiganya
  // (bisa memangkas latensi bagian ini sampai ~3x pada kondisi cache dingin). Masing-masing tetap
  // graceful-degradation sendiri-sendiri lewat `.catch()` per panggilan (persis seperti try/catch
  // sebelumnya) — kalau salah satu gagal (mis. sheet task_time_logs belum dikonfigurasi), yang
  // lain tetap tampil normal.
  let userNames = new Map<string, string>();
  let recentComments: Awaited<ReturnType<typeof getRecentCommentsForTasks>> = [];
  let timeIntervals: ClosedTimeInterval[] = [];
  let hoursWorkedTodayHours = 0;
  let weeklyProductivityPct = 0;
  let recentTimeTracking: ClosedTimeInterval[] = [];

  if (session && canViewTasking && visibleTasks.length > 0) {
    const visibleTaskIds = visibleTasks.map((t) => t.id);
    const [usersResult, commentsResult, timeLogsResult] = await Promise.all([
      // Nama semua user — dipakai feed "Komentar Terbaru" & "Pelacakan Waktu Terbaru" (Fase 11).
      SheetTable.getAll('users').catch(() => [] as SheetTable.SheetRow[]),
      // Fase 9: feed "Komentar Terbaru" — hanya dari task yang visible ke session ini (aturan
      // visibilitas yang sama seperti daftar Tasks). Kalau sheet task_comments belum
      // dikonfigurasi (belum setup OAuth Drive/sheet), Dashboard tetap tampil normal tanpa card
      // ini, bukan 500 — pola graceful-degradation yang sama seperti Time Tracking Fase 8.
      getRecentCommentsForTasks(visibleTaskIds, 5).catch(() => []),
      // Fase 11: event Time Tracking (Fase 8 — `task_time_logs`) dari task-task yang visible ke
      // session ini. Kalau sheet task_time_logs belum dikonfigurasi (mis. SHEET_ID_TASK_TIME_LOGS
      // belum diset saat deploy), fallback array kosong — metrik terkait di bawah ikut fallback
      // ke 0/kosong, pola graceful-degradation yang sama seperti fitur lain di halaman ini.
      SheetTable.getAll('task_time_logs').catch(() => [] as SheetTable.SheetRow[]),
    ]);

    userNames = new Map(usersResult.map((u) => [u.id, u.name]));
    recentComments = commentsResult;

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
