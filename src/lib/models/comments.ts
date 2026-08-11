import * as SheetTable from '@/lib/google/sheet-table';
import type { SheetRow } from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';
import { canManageTask } from '@/lib/models/tasks';
import { uploadAttachment, downloadAttachment, deleteAttachment } from '@/lib/google/drive-oauth';
import { sniffMimeType, ALLOWED_MIME_TYPES, SIZE_LIMITS_BYTES, type AttachmentCategory } from '@/lib/mime-sniff';

export type CommentRow = SheetRow & {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  attachment_drive_file_id: string;
  attachment_category: string;
  attachment_mime_type: string;
  attachment_original_name: string;
  attachment_file_size: string;
  created_at: string;
  updated_at: string;
  deleted_at: string;
};

/**
 * Aturan otorisasi (Fase 9, sesuai audit spesifikasi aplikasi lama):
 * - Tambah komentar: butuh izin 'edit' pada menu 'tasking' (dicek di layer API via
 *   requirePermission) DITAMBAH aturan visibilitas task yang sama seperti edit task
 *   (canManageTask — Member hanya boleh komentar di task miliknya sendiri).
 * - Edit: HANYA penulis komentar itu sendiri, tanpa pengecualian role apa pun (Admin sekalipun
 *   tidak boleh edit komentar orang lain — meniru persis aplikasi lama).
 * - Hapus: penulis sendiri, ATAU user dengan izin 'delete' pada 'tasking' (dicek di layer API).
 */
export function canAddComment(session: SessionPayload, task: SheetRow): boolean {
  return canManageTask(session, task);
}

export function canEditComment(session: SessionPayload, comment: CommentRow): boolean {
  return comment.user_id === session.userId;
}

export function canDeleteComment(session: SessionPayload, comment: CommentRow, hasDeletePermission: boolean): boolean {
  if (comment.user_id === session.userId) return true;
  return hasDeletePermission;
}

export async function getCommentsForTask(taskId: string): Promise<CommentRow[]> {
  const rows = (await SheetTable.getAll('task_comments')) as CommentRow[];
  return rows
    .filter((r) => r.task_id === taskId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')); // oldest-first, sesuai spesifikasi
}

export type CreateCommentInput = {
  taskId: string;
  userId: string;
  text: string;
  file?: { buffer: Buffer; originalName: string } | null;
};

export type CreateCommentResult =
  | { ok: true; comment: CommentRow }
  | { ok: false; error: string };

/** Komentar butuh TEKS ATAU LAMPIRAN (tidak wajib keduanya, tapi tidak boleh kosong dua-duanya). */
export async function createComment(input: CreateCommentInput): Promise<CreateCommentResult> {
  const text = input.text.trim();
  if (!text && !input.file) {
    return { ok: false, error: 'Komentar harus berisi teks atau lampiran file.' };
  }

  let attachment: {
    driveFileId: string;
    category: AttachmentCategory;
    mimeType: string;
    originalName: string;
    fileSize: number;
  } | null = null;

  if (input.file) {
    const sniffed = sniffMimeType(input.file.buffer);
    if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed.mime)) {
      return { ok: false, error: 'Jenis file tidak didukung. Gunakan gambar, video, PDF, dokumen, atau file teks.' };
    }
    const limit = SIZE_LIMITS_BYTES[sniffed.category];
    if (input.file.buffer.length > limit) {
      const limitMb = Math.round(limit / (1024 * 1024));
      return { ok: false, error: `Ukuran file terlalu besar. Maksimal ${limitMb}MB untuk tipe ${sniffed.category}.` };
    }

    try {
      const uploaded = await uploadAttachment(input.file.buffer, sniffed.mime, input.file.originalName);
      attachment = {
        driveFileId: uploaded.driveFileId,
        category: sniffed.category,
        mimeType: sniffed.mime,
        originalName: input.file.originalName,
        fileSize: uploaded.fileSize,
      };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error && /belum diset/.test(e.message)
            ? 'Penyimpanan lampiran (Google Drive) belum dikonfigurasi di server ini. Hubungi admin, atau kirim komentar tanpa lampiran.'
            : 'Gagal upload lampiran ke Google Drive.',
      };
    }
  }

  const row = (await SheetTable.insertRow('task_comments', {
    task_id: input.taskId,
    user_id: input.userId,
    comment: text,
    attachment_drive_file_id: attachment?.driveFileId || '',
    attachment_category: attachment?.category || '',
    attachment_mime_type: attachment?.mimeType || '',
    attachment_original_name: attachment?.originalName || '',
    attachment_file_size: attachment ? String(attachment.fileSize) : '',
  })) as CommentRow;

  return { ok: true, comment: row };
}

export type EditCommentResult = { ok: true; comment: CommentRow } | { ok: false; error: string };

/** Edit HANYA mengubah teks (lampiran tidak bisa diganti lewat edit — meniru aplikasi lama, hapus & buat baru kalau perlu ganti lampiran). */
export async function editCommentText(commentId: string, newText: string): Promise<EditCommentResult> {
  const text = newText.trim();
  const existing = (await SheetTable.findById('task_comments', commentId)) as CommentRow | undefined;
  if (!existing) return { ok: false, error: 'Komentar tidak ditemukan.' };
  if (!text && !existing.attachment_drive_file_id) {
    return { ok: false, error: 'Komentar harus berisi teks atau lampiran file.' };
  }

  const updated = (await SheetTable.updateRow('task_comments', commentId, { comment: text })) as CommentRow;
  return { ok: true, comment: updated };
}

export async function deleteComment(commentId: string): Promise<void> {
  // Soft-delete metadata di sheet (konsisten dengan konvensi seluruh app), TAPI file lampiran di
  // Drive dihapus permanen sekalian (best-effort) — supaya tidak menumpuk file yatim di Drive
  // pribadi admin selamanya untuk komentar yang sudah dihapus user.
  const existing = (await SheetTable.findById('task_comments', commentId)) as CommentRow | undefined;
  if (existing?.attachment_drive_file_id) {
    await deleteAttachment(existing.attachment_drive_file_id);
  }
  await SheetTable.softDeleteRow('task_comments', commentId);
}

export async function getAttachmentContent(comment: CommentRow): Promise<Buffer> {
  return downloadAttachment(comment.attachment_drive_file_id);
}

/** Feed "Komentar Terbaru" Dashboard — beberapa komentar terbaru dari task yang visible ke session. */
export async function getRecentCommentsForTasks(taskIds: string[], limit: number): Promise<CommentRow[]> {
  if (taskIds.length === 0) return [];
  const taskIdSet = new Set(taskIds);
  const rows = (await SheetTable.getAll('task_comments')) as CommentRow[];
  return rows
    .filter((r) => taskIdSet.has(r.task_id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')) // newest-first untuk feed
    .slice(0, limit);
}
