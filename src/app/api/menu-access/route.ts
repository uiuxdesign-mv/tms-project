import { NextRequest, NextResponse, after } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { findRoleById } from '@/lib/models/roles';
import { MENU_KEYS } from '@/lib/menu-access/config';
import { getPermissionMatrixForRole, savePermissionMatrixForRole, type PermissionMatrixRow } from '@/lib/menu-access/permissions';
import { logAction } from '@/lib/models/audit-log';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const roleId = req.nextUrl.searchParams.get('role_id') || '';
  if (!roleId) return NextResponse.json({ error: 'role_id wajib diisi.' }, { status: 400 });

  // Bugfix (permintaan user, "Unexpected end of JSON input"): dibungkus try/catch — lihat
  // catatan lengkap di GET /api/master/[entity]/options.
  try {
    const role = await findRoleById(roleId);
    if (!role) return NextResponse.json({ error: 'Role tidak ditemukan.' }, { status: 404 });
    if (role.role_key === 'admin') {
      return NextResponse.json({ error: 'Hak akses role Admin tidak diatur di sini (selalu penuh).' }, { status: 400 });
    }

    // Bugfix (permintaan user, item data-staleness): lihat catatan sama di GET /api/master/[entity].
    const matrix = await getPermissionMatrixForRole(roleId, { useCache: false });
    return NextResponse.json({ data: { matrix, menus: MENU_KEYS } });
  } catch (err) {
    console.error('GET /api/menu-access gagal:', err);
    return NextResponse.json(
      { error: 'Gagal memuat hak akses dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: { role_id?: string; matrix?: PermissionMatrixRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });
  }

  const roleId = String(body.role_id || '');
  if (!roleId) return NextResponse.json({ error: 'role_id wajib diisi.' }, { status: 400 });

  const role = await findRoleById(roleId);
  if (!role) return NextResponse.json({ error: 'Role tidak ditemukan.' }, { status: 404 });
  if (role.role_key === 'admin') {
    return NextResponse.json({ error: 'Hak akses role Admin tidak bisa diubah lewat sini.' }, { status: 400 });
  }

  if (!Array.isArray(body.matrix)) {
    return NextResponse.json({ error: 'matrix wajib berupa array.' }, { status: 400 });
  }

  await savePermissionMatrixForRole(roleId, body.matrix);

  const matrix = await getPermissionMatrixForRole(roleId);

  after(() =>
    logAction({
      actorUserId: guard.session.userId,
      actorName: guard.session.name,
      action: 'update',
      entityType: 'menu_access',
      entityId: roleId,
      entityLabel: `Hak akses role ${role.role_name}`,
      details: matrix
        .filter((m) => m.can_view || m.can_create || m.can_edit || m.can_delete)
        .map((m) => `${m.menu_key}(${[m.can_view && 'L', m.can_create && 'T', m.can_edit && 'U', m.can_delete && 'H'].filter(Boolean).join('')})`)
        .join(', ') || 'Semua akses dicabut',
    })
  );

  return NextResponse.json({ data: { matrix, menus: MENU_KEYS } });
}
