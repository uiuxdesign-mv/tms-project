import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import UsersTable from '@/components/users-table';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Fase 7: Master Users dikunci permanen admin-only (bukan lagi lewat Menu Access) — meniru
  // aplikasi lama yang mengecualikan Master User dari matrix permission selamanya by design.
  // session.isAdmin sudah mencakup role lain yang ditandai is_admin="Ya" di Master Role juga.
  if (!session.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak punya akses ke halaman Master User. Fitur ini hanya untuk Administrator.
      </div>
    );
  }

  // Bugfix (permintaan user Round 7, poin 1): lihat catatan lengkap di src/app/(app)/tasks/page.tsx
  // — pembungkus mx-auto max-w-5xl dihapus supaya spacing kiri-kanan sama dengan halaman lain.
  return (
    <UsersTable
      currentUserId={session.userId}
      permissions={{ canCreate: true, canEdit: true, canDelete: true }}
    />
  );
}
