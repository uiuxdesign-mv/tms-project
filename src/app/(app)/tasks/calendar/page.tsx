import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import CalendarView from '@/components/calendar-view';

export default async function TasksCalendarPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canView = await hasMenuPermission(session, 'tasking', 'view');
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
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Calendar</h1>
      <CalendarView initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} />
    </div>
  );
}
