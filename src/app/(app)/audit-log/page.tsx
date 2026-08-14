import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import AuditLogView from '@/components/audit-log-view';

export default async function AuditLogPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  if (!session.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak punya akses ke halaman Audit Log. Fitur ini hanya untuk Administrator.
      </div>
    );
  }

  // Bugfix (permintaan user Round 7, poin 1): lihat catatan lengkap di src/app/(app)/tasks/page.tsx
  // — pembungkus mx-auto max-w-6xl dihapus supaya spacing kiri-kanan sama dengan halaman lain.
  return <AuditLogView />;
}
