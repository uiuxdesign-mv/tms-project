import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import TasksTable from '@/components/tasks-table';

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Fase 7: Tasking sekarang digerbang Menu Access (sebelumnya terbuka untuk siapa saja yang login).
  const [canView, canCreate, canEdit, canDelete] = await Promise.all([
    hasMenuPermission(session, 'tasking', 'view'),
    hasMenuPermission(session, 'tasking', 'create'),
    hasMenuPermission(session, 'tasking', 'edit'),
    hasMenuPermission(session, 'tasking', 'delete'),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak punya akses ke halaman Tasking.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <TasksTable
        currentUserId={session.userId}
        isAdmin={session.roleKey === 'admin'}
        permissions={{ canCreate, canEdit, canDelete }}
      />
    </div>
  );
}
