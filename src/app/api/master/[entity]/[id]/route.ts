import { NextRequest, NextResponse, after } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEntityConfig } from '@/lib/master-data/config';
import { validateEntityPayload } from '@/lib/master-data/validate';
import { findBlockingReferences } from '@/lib/master-data/references';
import { enforceSingleDefaultStatus, enforceSingleReviewStatus } from '@/lib/master-data/status-hooks';
import * as SheetTable from '@/lib/google/sheet-table';
import { logAction } from '@/lib/models/audit-log';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await ctx.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: 'Entity tidak ditemukan.' }, { status: 404 });

  const guard = await requirePermission(`master-${entity}`, 'edit');
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });
  }

  const existing = await SheetTable.findById(config.key, id);
  if (!existing) return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 });

  const result = await validateEntityPayload(config, body, existing);
  if (!result.valid) {
    return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: result.errors }, { status: 422 });
  }

  const updated = await SheetTable.updateRow(config.key, id, result.data);
  if (!updated) return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 });

  if (config.key === 'statuses' && result.data.is_default === 'Ya') {
    await enforceSingleDefaultStatus(id);
  }
  if (config.key === 'statuses' && result.data.is_review === 'Ya') {
    await enforceSingleReviewStatus(id);
  }

  // Bugfix (permintaan user, item speed): logAction() dipindah ke after() — lihat catatan di
  // POST /api/tasks.
  after(() =>
    logAction({
      actorUserId: guard.session.userId,
      actorName: guard.session.name,
      action: 'update',
      entityType: config.key,
      entityId: id,
      entityLabel: updated[config.titleField] || id,
    })
  );

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await ctx.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: 'Entity tidak ditemukan.' }, { status: 404 });

  const guard = await requirePermission(`master-${entity}`, 'delete');
  if ('error' in guard) return guard.error;

  const existing = await SheetTable.findById(config.key, id);
  if (!existing) return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 });

  // Proteksi "bawaan sistem" (Fase 7) — independen dari reference count, selalu diblokir.
  // Meniru is_system hard-block di Master Role aplikasi lama (admin/manager/member tidak
  // pernah bisa dihapus, apapun kondisinya).
  if (config.systemFlagField && existing[config.systemFlagField] === 'Ya') {
    return NextResponse.json(
      { error: `${config.label} "${existing[config.titleField]}" adalah data bawaan sistem dan tidak bisa dihapus.` },
      { status: 409 }
    );
  }

  // Status default tidak boleh dihapus (Fase 7) — meniru guard di MasterStatusController::destroy().
  if (config.key === 'statuses' && existing.is_default === 'Ya') {
    return NextResponse.json(
      { error: 'Status ini adalah status default (awal task baru). Jadikan status lain sebagai default terlebih dahulu sebelum menghapus.' },
      { status: 409 }
    );
  }

  const blocking = await findBlockingReferences(config.key, id);
  if (blocking.blocked) {
    return NextResponse.json({ error: blocking.message, reassignable: blocking.reassignable }, { status: 409 });
  }

  await SheetTable.softDeleteRow(config.key, id);

  after(() =>
    logAction({
      actorUserId: guard.session.userId,
      actorName: guard.session.name,
      action: 'delete',
      entityType: config.key,
      entityId: id,
      entityLabel: existing?.[config.titleField] || id,
    })
  );

  return NextResponse.json({ ok: true });
}
