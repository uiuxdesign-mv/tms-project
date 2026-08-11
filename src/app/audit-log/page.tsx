import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/get-session';
import AuditLogView from '@/components/audit-log-view';

export default async function AuditLogPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  if (session.roleKey !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Anda tidak punya akses ke halaman Audit Log. Fitur ini hanya untuk Administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Kembali ke Dashboard
          </Link>
        </div>
        <AuditLogView />
      </div>
    </div>
  );
}
