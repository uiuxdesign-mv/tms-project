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

  return (
    <div className="mx-auto max-w-[1400px]">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Papan Kanban</h1>
      <KanbanBoard currentUserId={session.userId} isAdmin={session.roleKey === 'admin'} permissions={{ canEdit }} />
    </div>
  );
}
