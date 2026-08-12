import { NextRequest, NextResponse, after } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEntityConfig } from '@/lib/master-data/config';
import { validateEntityPayload } from '@/lib/master-data/validate';
import * as SheetTable from '@/lib/google/sheet-table';
import { logAction } from '@/lib/models/audit-log';
import { enforceSingleDefaultStatus, enforceSingleReviewStatus } from '@/lib/master-data/status-hooks';
import { generateUniqueRoleKey } from '@/lib/models/roles';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: 'Entity tidak ditemukan.' }, { status: 404 });

  const guard = await requirePermission(`master-${entity}`, 'view');
  if ('error' in guard) return guard.error;

  // Bugfix (permintaan user, item data-staleness): sebelumnya pakai cache in-memory 30 detik
  // (default) — setelah Tambah/Edit/Hapus di Master Data, list ini bisa saja dilayani instance
  // serverless Vercel lain yang masih baca cache basi, sehingga UI baru update setelah refresh
  // manual. Sekarang selalu baca langsung dari Google Sheets, sama seperti fix yang sudah
  // diterapkan di GET /api/tasks sebelumnya.
  const rows = await SheetTable.getAll(config.key, { useCache: false });
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: 'Entity tidak ditemukan.' }, { status: 404 });

  const guard = await requirePermission(`master-${entity}`, 'create');
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });
  }

  const result = await validateEntityPayload(config, body);
  if (!result.valid) {
    return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: result.errors }, { status: 422 });
  }

  // Role: role_key tidak lagi diinput manual di form (Fase 12, sesuai video) — generate otomatis
  // dari role_name di sini, sebelum insert.
  let insertData = result.data;
  if (config.key === 'roles') {
    const roleKey = await generateUniqueRoleKey(result.data.role_name);
    insertData = { ...result.data, role_key: roleKey };
  }

  // Status: field "Urutan" (sort_order) tidak lagi diisi manual di form Tambah (Fase 15, sesuai
  // permintaan user) — status baru otomatis ditaruh di posisi PALING BAWAH (urutan tertinggi saat
  // ini + 1), lalu bisa diatur ulang langsung dari tabel lewat tombol naik/turun.
  if (config.key === 'statuses') {
    const existingStatuses = await SheetTable.getAll('statuses');
    const maxOrder = existingStatuses.reduce((max, r) => Math.max(max, Number(r.sort_order) || 0), 0);
    insertData = { ...insertData, sort_order: String(maxOrder + 1) };
  }

  const row = await SheetTable.insertRow(config.key, insertData);

  // Status: pastikan hanya tepat satu baris is_default="Ya" (Fase 7) — meniru
  // Status::clearDefaultFlag() di aplikasi lama.
  if (config.key === 'statuses' && result.data.is_default === 'Ya') {
    await enforceSingleDefaultStatus(row.id);
  }
  // Status: pastikan paling banyak satu baris is_review="Ya" (Fase 8, Time Tracking).
  if (config.key === 'statuses' && result.data.is_review === 'Ya') {
    await enforceSingleReviewStatus(row.id);
  }

  // Bugfix (permintaan user, item speed): logAction() dipindah ke after() — tidak lagi
  // memperlambat response (lihat catatan lengkap di POST /api/tasks).
  after(() =>
    logAction({
      actorUserId: guard.session.userId,
      actorName: guard.session.name,
      action: 'create',
      entityType: config.key,
      entityId: row.id,
      entityLabel: row[config.titleField] || row.id,
    })
  );

  return NextResponse.json({ data: row }, { status: 201 });
}
