import { NextRequest, NextResponse, after } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEntityConfig } from '@/lib/master-data/config';
import { reassignReferences, getReverseReferenceDefs } from '@/lib/master-data/references';
import * as SheetTable from '@/lib/google/sheet-table';
import { logAction } from '@/lib/models/audit-log';

/**
 * "Replace Existing Data" (Fase 7) — memindahkan semua data yang masih mereferensikan baris ini
 * (mis. Task yang masih pakai Task Type ini) ke baris pengganti pilihan admin, baru kemudian
 * soft-delete baris asal. Meniru TaskType::reassignAndDelete() di aplikasi lama, tapi berlaku
 * generik untuk semua entity Master Data yang direferensikan Task (Client/Project/Priority/
 * Task Type/Status), bukan hanya Task Type.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await ctx.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: 'Entity tidak ditemukan.' }, { status: 404 });

  const guard = await requirePermission(`master-${entity}`, 'delete');
  if ('error' in guard) return guard.error;

  if (getReverseReferenceDefs(config.key).length === 0) {
    return NextResponse.json({ error: 'Entity ini tidak mendukung Ganti & Hapus.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const toId = String(body?.to_id || '');
  if (!toId) return NextResponse.json({ error: 'Pilihan pengganti wajib dipilih.' }, { status: 422 });
  if (toId === id) return NextResponse.json({ error: 'Pilihan pengganti tidak boleh sama dengan data yang dihapus.' }, { status: 422 });

  // Bugfix (permintaan user, item speed): 2 lookup independen ini (baris asal & baris pengganti,
  // sama-sama dari sheet yang sama tapi id berbeda) sebelumnya berurutan — sekarang paralel.
  const [existing, replacement] = await Promise.all([
    SheetTable.findById(config.key, id),
    SheetTable.findById(config.key, toId),
  ]);
  if (!existing) return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 });

  if (config.systemFlagField && existing[config.systemFlagField] === 'Ya') {
    return NextResponse.json(
      { error: `${config.label} "${existing[config.titleField]}" adalah data bawaan sistem dan tidak bisa dihapus.` },
      { status: 409 }
    );
  }

  if (!replacement) return NextResponse.json({ error: 'Data pengganti tidak ditemukan.' }, { status: 404 });

  const movedCount = await reassignReferences(config.key, id, toId);
  await SheetTable.softDeleteRow(config.key, id);

  after(() =>
    logAction({
      actorUserId: guard.session.userId,
      actorName: guard.session.name,
      action: 'delete',
      entityType: config.key,
      entityId: id,
      entityLabel: `${existing[config.titleField] || id} (dipindahkan ke "${replacement[config.titleField] || toId}", ${movedCount} data terdampak)`,
    })
  );

  return NextResponse.json({ ok: true, movedCount });
}
