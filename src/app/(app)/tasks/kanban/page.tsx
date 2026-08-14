import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import KanbanBoard from '@/components/kanban-board';

export default async function TasksKanbanPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [canView, canEdit] = await Promise.all([
    hasMenuPermission(session, 'tasking', 'view'),
    hasMenuPermission(session, 'tasking', 'edit'),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak punya akses ke halaman Tasking.
      </div>
    );
  }

  // Bugfix (permintaan user Round 7, poin 1): lihat catatan lengkap di src/app/(app)/tasks/page.tsx
  // — pembungkus mx-auto max-w-[1400px] dihapus supaya lebar tab Kanban sama dengan List/Calendar
  // & seluruh halaman lain, konsisten dengan Dashboard.
  return <KanbanBoard currentUserId={session.userId} isAdmin={session.isAdmin} permissions={{ canEdit }} />;
}
