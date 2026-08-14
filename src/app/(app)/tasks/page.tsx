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

  // Bugfix (permintaan user Round 7, poin 1): pembungkus `mx-auto max-w-*` di halaman ini
  // (juga di 8 halaman lain — lihat catatan sama di masing-masing) DIHAPUS supaya spacing kiri-
  // kanan konten SAMA di semua menu, mengikuti halaman Dashboard yang memang tidak pernah punya
  // pembatas lebar sama sekali (lihat src/app/(app)/dashboard/page.tsx) — sebelumnya tiap halaman
  // punya nilai max-w berbeda-beda (2xl/4xl/5xl/6xl/1200px/1400px), termasuk antar tab List/
  // Kanban/Calendar di halaman Tasking ini sendiri yang sebelumnya tidak sama lebarnya satu sama
  // lain. Gutter kiri-kanan sekarang murni dari padding `main` di app-shell.tsx (p-4 sm:p-6),
  // konsisten di seluruh aplikasi.
  return (
    <TasksTable
      currentUserId={session.userId}
      isAdmin={session.isAdmin}
      permissions={{ canCreate, canEdit, canDelete }}
    />
  );
}
