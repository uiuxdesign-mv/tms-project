import Link from 'next/link';
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
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Anda tidak punya akses ke halaman Tasking.
        </div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Kembali ke Dashboard
          </Link>
          <div className="flex gap-3">
            <Link href="/tasks" className="text-sm text-gray-500 hover:text-gray-700">
              List
            </Link>
            <Link href="/tasks/kanban" className="text-sm text-gray-500 hover:text-gray-700">
              Kanban
            </Link>
          </div>
        </div>
        <h1 className="mb-4 text-xl font-semibold text-gray-900">Calendar</h1>
        <CalendarView initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} />
      </div>
    </div>
  );
}
