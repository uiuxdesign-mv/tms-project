import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { getEntityConfig } from '@/lib/master-data/config';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import MasterDataTable from '@/components/master-data-table';

export default async function MasterEntityPage({ params }: { params: Promise<{ entity: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { entity } = await params;
  const config = getEntityConfig(entity);
  if (!config) notFound();

  // `config.fields[].pattern` adalah objek RegExp (dipakai HANYA untuk validasi di server,
  // lihat src/lib/master-data/validate.ts). RegExp tidak bisa dikirim dari Server Component ke
  // Client Component (React akan error "Only plain objects... can be passed to Client
  // Components" — muncul di production sebagai "Minified React error #441"). MasterDataTable
  // (client component) tidak pernah memakai field.pattern, jadi cukup dibuang di sini sebelum
  // di-pass ke client.
  const clientConfig = {
    ...config,
    fields: config.fields.map(({ pattern: _pattern, ...rest }) => rest),
  };

  const menuKey = `master-${entity}`;
  const [canView, canCreate, canEdit, canDelete, canExport] = await Promise.all([
    hasMenuPermission(session, menuKey, 'view'),
    hasMenuPermission(session, menuKey, 'create'),
    hasMenuPermission(session, menuKey, 'edit'),
    hasMenuPermission(session, menuKey, 'delete'),
    hasMenuPermission(session, menuKey, 'export'),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak punya akses ke halaman Master {config.labelPlural}.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <MasterDataTable
        entityKey={entity}
        config={clientConfig}
        permissions={{ canCreate, canEdit, canDelete, canExport }}
      />
    </div>
  );
}
