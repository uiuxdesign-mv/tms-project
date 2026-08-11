import * as SheetTable from '@/lib/google/sheet-table';
import type { SheetRow } from '@/lib/google/sheet-table';

export type AuditAction = 'create' | 'update' | 'delete';

export type AuditLogEntry = {
  id: string;
  actor_user_id: string;
  actor_name: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  details: string;
  created_at: string;
};

/**
 * Catat 1 aksi ke sheet Audit Log. Sengaja "fire-and-forget" (tidak pernah melempar error) —
 * kalau pencatatan audit log gagal (mis. kuota Google Sheets API habis), operasi utama
 * (simpan/ubah/hapus data) tetap harus berhasil untuk user. Kegagalan hanya dicatat ke
 * console server, tidak boleh sampai membuat request user gagal gara-gara audit log.
 */
export async function logAction(params: {
  actorUserId: string;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  details?: string;
}): Promise<void> {
  try {
    await SheetTable.insertRow('audit_log', {
      actor_user_id: params.actorUserId,
      actor_name: params.actorName,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      entity_label: params.entityLabel || params.entityId,
      details: params.details || '',
    });
  } catch (err) {
    console.error('[audit-log] gagal mencatat aksi:', err);
  }
}

/** Ambil semua entri audit log, terbaru lebih dulu. Dipakai halaman Audit Log (admin-only). */
export async function getAuditLog(): Promise<AuditLogEntry[]> {
  const rows = await SheetTable.getAll('audit_log', { includeDeleted: true }); // tidak ada soft-delete di Audit Log
  return (rows as SheetRow[])
    .map((r) => ({
      id: r.id,
      actor_user_id: r.actor_user_id,
      actor_name: r.actor_name,
      action: (r.action as AuditAction) || 'update',
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_label: r.entity_label,
      details: r.details,
      created_at: r.created_at,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
