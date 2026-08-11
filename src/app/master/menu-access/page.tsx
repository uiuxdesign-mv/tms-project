import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/get-session';
import MenuAccessTable from '@/components/menu-access-table';

export default async function MenuAccessPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Sengaja tetap hardcode admin-only (bukan requirePermission) — halaman ini yang mengatur
  // hak akses menu lain, jadi tidak boleh diatur oleh permission yang diaturnya sendiri.
  if (session.roleKey !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Anda tidak punya akses ke halaman Menu Access. Fitur ini hanya untuk Administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Kembali ke Dashboard
          </Link>
        </div>
        <MenuAccessTable />
      </div>
    </div>
  );
}
