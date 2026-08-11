import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEntityConfig } from '@/lib/master-data/config';
import { validateEntityPayload } from '@/lib/master-data/validate';
import * as SheetTable from '@/lib/google/sheet-table';
import { logAction } from '@/lib/models/audit-log';
import { enforceSingleDefaultStatus, enforceSingleReviewStatus } from '@/lib/master-data/status-hooks';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: 'Entity tidak ditemukan.' }, { status: 404 });

  const guard = await requirePermission(`master-${entity}`, 'view');
  if ('error' in guard) return guard.error;

  const rows = await SheetTable.getAll(config.key);
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

  const row = await SheetTable.insertRow(config.key, result.data);

  // Status: pastikan hanya tepat satu baris is_default="Ya" (Fase 7) — meniru
  // Status::clearDefaultFlag() di aplikasi lama.
  if (config.key === 'statuses' && result.data.is_default === 'Ya') {
    await enforceSingleDefaultStatus(row.id);
  }
  // Status: pastikan paling banyak satu baris is_review="Ya" (Fase 8, Time Tracking).
  if (config.key === 'statuses' && result.data.is_review === 'Ya') {
    await enforceSingleReviewStatus(row.id);
  }

  await logAction({
    actorUserId: guard.session.userId,
    actorName: guard.session.name,
    action: 'create',
    entityType: config.key,
    entityId: row.id,
    entityLabel: row[config.titleField] || row.id,
  });

  return NextResponse.json({ data: row }, { status: 201 });
}
