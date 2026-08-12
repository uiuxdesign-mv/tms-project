import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import CalendarView from '@/components/calendar-view';

export default async function TasksCalendarPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [canView, canCreate] = await Promise.all([
    hasMenuPermission(session, 'tasking', 'view'),
    hasMenuPermission(session, 'tasking', 'create'),
  ]);
  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak punya akses ke halaman Tasking.
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="mx-auto max-w-[1200px]">
      <CalendarView initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} canCreate={canCreate} />
    </div>
  );
}
