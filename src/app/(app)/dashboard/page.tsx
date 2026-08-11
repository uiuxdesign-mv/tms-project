import { getSession } from '@/lib/auth/get-session';
import { getVisibleMenuKeys } from '@/lib/menu-access/permissions';
import { getVisibleEnrichedTasks } from '@/lib/models/reports';
import { summarizeTasks } from '@/lib/reports/summarize';
import { getRecentCommentsForTasks } from '@/lib/models/comments';
import { getAuditLog, type AuditLogEntry } from '@/lib/models/audit-log';
import * as SheetTable from '@/lib/google/sheet-table';
import DashboardView from '@/components/dashboard-view';

export default async function DashboardPage() {
  const session = await getSession();
  const isAdmin = session?.roleKey === 'admin';

  const visibleKeys = session ? await getVisibleMenuKeys(session) : new Set<string>();
  const canViewTasking = visibleKeys.has('tasking');
  const canViewReport = visibleKeys.has('report');

  // Ringkasan & chart tugas di Dashboard hanya relevan kalau user memang punya akses Tasking
  // (Fase 7) — sebelumnya selalu dihitung untuk siapa saja yang login, meski Tasking sekarang
  // digerbang.
  const visibleTasks = session && canViewTasking ? await getVisibleEnrichedTasks(session) : [];
  const summary = session && canViewTasking ? summarizeTasks(visibleTasks) : null;

  // Feed "Tugas Jatuh Tempo Segera" — 14 hari ke depan, belum final, urut tanggal jatuh tempo
  // terdekat dulu.
  const todayStr = new Date().toISOString().slice(0, 10);
  const in14Str = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcomingDue = visibleTasks
    .filter((t) => !t.is_final && t.due_date && t.due_date >= todayStr && t.due_date <= in14Str)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  // Feed "Tugas Terbaru" — 5 task terakhir dibuat (dari yang visible ke session ini).
  const recentTasks = [...visibleTasks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  // Fase 9: feed "Komentar Terbaru" — hanya dari task yang visible ke session ini (aturan
  // visibilitas yang sama seperti daftar Tasks), dibungkus try/catch supaya kalau sheet
  // task_comments belum dikonfigurasi (belum setup OAuth Drive/sheet), Dashboard tetap tampil
  // normal tanpa card ini, bukan 500 — pola graceful-degradation yang sama seperti Time Tracking
  // Fase 8.
  let recentComments: Awaited<ReturnType<typeof getRecentCommentsForTasks>> = [];
  let commentUserNames = new Map<string, string>();
  if (session && canViewTasking && visibleTasks.length > 0) {
    try {
      recentComments = await getRecentCommentsForTasks(visibleTasks.map((t) => t.id), 5);
      if (recentComments.length > 0) {
        const users = await SheetTable.getAll('users');
        commentUserNames = new Map(users.map((u) => [u.id, u.name]));
      }
    } catch {
      recentComments = [];
    }
  }
  const taskTitleById = new Map(visibleTasks.map((t) => [t.id, t.title]));

  // Fase 10: feed "Aktivitas Terbaru" mewire Audit Log yang sudah ada sejak Fase 6 — admin-only,
  // konsisten dengan halaman Audit Log itu sendiri yang juga admin-only.
  let recentActivity: AuditLogEntry[] = [];
  if (isAdmin) {
    try {
      recentActivity = (await getAuditLog()).slice(0, 6);
    } catch {
      recentActivity = [];
    }
  }

  return (
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
      upcomingDue={upcomingDue}
      recentTasks={recentTasks}
      recentComments={recentComments}
      commentUserNames={Object.fromEntries(commentUserNames)}
      taskTitleById={Object.fromEntries(taskTitleById)}
      recentActivity={recentActivity}
    />
  );
}
