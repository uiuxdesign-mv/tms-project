import Link from 'next/link';
import { getSession } from '@/lib/auth/get-session';
import { MASTER_MENU_KEYS } from '@/lib/menu-access/config';
import { getVisibleMenuKeys } from '@/lib/menu-access/permissions';
import { getVisibleEnrichedTasks } from '@/lib/models/reports';
import { summarizeTasks } from '@/lib/reports/summarize';
import { getRecentCommentsForTasks } from '@/lib/models/comments';
import * as SheetTable from '@/lib/google/sheet-table';
import LogoutButton from './logout-button';

export default async function DashboardPage() {
  const session = await getSession();
  const isAdmin = session?.roleKey === 'admin';

  const visibleKeys = session ? await getVisibleMenuKeys(session) : new Set<string>();
  const visibleMasterMenus = MASTER_MENU_KEYS.filter((m) => visibleKeys.has(m.key));
  const canViewTasking = visibleKeys.has('tasking');
  const canViewReport = visibleKeys.has('report');

  // Ringkasan tugas di Dashboard hanya relevan kalau user memang punya akses Tasking (Fase 7) —
  // sebelumnya selalu dihitung untuk siapa saja yang login, meski Tasking sekarang digerbang.
  const visibleTasks = session && canViewTasking ? await getVisibleEnrichedTasks(session) : [];
  const summary = session && canViewTasking ? summarizeTasks(visibleTasks) : null;

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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-700">
              Profil Saya
            </Link>
            <LogoutButton />
          </div>
        </div>

        <p className="text-sm text-gray-600">
          Login berhasil sebagai <span className="font-medium">{session?.name}</span> ({session?.email})
        </p>
        <dl className="mt-4 space-y-1 text-sm text-gray-600">
          <div>
            <dt className="inline font-medium text-gray-700">Role: </dt>
            <dd className="inline">{session?.roleName} ({session?.roleKey})</dd>
          </div>
          <div>
            <dt className="inline font-medium text-gray-700">Boleh menugaskan ke user lain: </dt>
            <dd className="inline">{session?.canAssignOthers ? 'Ya' : 'Tidak'}</dd>
          </div>
        </dl>

        {(canViewTasking || canViewReport) && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Task Management</h2>
            <div className="flex gap-2">
              {canViewTasking && (
                <Link
                  href="/tasks"
                  className="inline-block rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Tasks
                </Link>
              )}
              {canViewReport && (
                <Link
                  href="/reports"
                  className="inline-block rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Reports
                </Link>
              )}
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Ringkasan Tugas</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-gray-200 p-3">
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-xl font-semibold text-gray-900">{summary.total}</p>
              </div>
              <div className="rounded-md border border-gray-200 p-3">
                <p className="text-xs text-gray-500">Terlambat</p>
                <p className="text-xl font-semibold text-red-600">{summary.overdue}</p>
              </div>
              <div className="rounded-md border border-gray-200 p-3">
                <p className="text-xs text-gray-500">Jatuh Tempo 7 Hari</p>
                <p className="text-xl font-semibold text-amber-600">{summary.dueSoon}</p>
              </div>
            </div>
            {canViewReport && (
              <Link href="/reports" className="mt-2 inline-block text-xs text-gray-500 hover:text-gray-700">
                Lihat laporan lengkap →
              </Link>
            )}
          </div>
        )}

        {recentComments.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Komentar Terbaru</h2>
            <div className="space-y-2">
              {recentComments.map((c) => (
                <div key={c.id} className="rounded-md border border-gray-200 p-3 text-sm">
                  <div className="mb-0.5 flex items-center justify-between text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{commentUserNames.get(c.user_id) || 'User'}</span>
                    <span>{taskTitleById.get(c.task_id) || 'Task'}</span>
                  </div>
                  <p className="truncate text-gray-600">
                    {c.comment || (c.attachment_original_name ? `📎 ${c.attachment_original_name}` : '')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleMasterMenus.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Master Data</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleMasterMenus.map((m) => (
                <Link
                  key={m.key}
                  href={m.href}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {m.label.replace(/^Master /, '')}
                </Link>
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Administrasi</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Link
                href="/master/menu-access"
                className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Menu Access
              </Link>
              <Link
                href="/audit-log"
                className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Audit Log
              </Link>
            </div>
          </div>
        )}

        <p className="mt-8 text-xs text-gray-400">
          Menu Master Data mengikuti hak akses role Anda (diatur Admin di Menu Access). Ringkasan &amp; Report
          tugas mengikuti visibilitas Tasks yang sama seperti sebelumnya.
        </p>
      </div>
    </div>
  );
}
