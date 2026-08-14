import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import ReportsView from '@/components/reports-view';

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Fase 7: Report sekarang digerbang Menu Access (sebelumnya terbuka untuk siapa saja yang login).
  const [canView, canExport] = await Promise.all([
    hasMenuPermission(session, 'report', 'view'),
    hasMenuPermission(session, 'report', 'export'),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak punya akses ke halaman Report.
      </div>
    );
  }

  // Bugfix (permintaan user Round 7, poin 1): lihat catatan lengkap di src/app/(app)/tasks/page.tsx
  // — pembungkus mx-auto max-w-6xl dihapus supaya spacing kiri-kanan sama dengan halaman lain
  // (chart di dalamnya juga jadi punya lebih banyak ruang, relevan dengan poin 2).
  return <ReportsView canExport={canExport} />;
}
