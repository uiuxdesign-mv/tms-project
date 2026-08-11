import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/get-session';
import UsersTable from '@/components/users-table';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Fase 7: Master Users dikunci permanen admin-only (bukan lagi lewat Menu Access) — meniru
  // aplikasi lama yang mengecualikan Master User dari matrix permission selamanya by design.
  if (session.roleKey !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Anda tidak punya akses ke halaman Master User. Fitur ini hanya untuk Administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Kembali ke Dashboard
          </Link>
        </div>
        <UsersTable
          currentUserId={session.userId}
          permissions={{ canCreate: true, canEdit: true, canDelete: true }}
        />
      </div>
    </div>
  );
}
