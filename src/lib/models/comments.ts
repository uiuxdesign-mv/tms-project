import * as SheetTable from '@/lib/google/sheet-table';
import type { SheetRow } from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';
import { canViewTask } from '@/lib/models/tasks';
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
 * Aturan otorisasi (DIPERBARUI — permintaan user, perbaikan Leader & Pemberi Tugas poin 2):
 * - Baca komentar: cukup aturan visibilitas task (canViewTask).
 * - Tambah komentar: SEKARANG cukup bisa MELIHAT task-nya (canViewTask), tidak lagi harus bisa
 *   mengelola (canManageTaskInfo) — sesuai permintaan user eksplisit poin 2 ("pemberi tugas
 *   tetap bisa mengakses dan menambahkan komentar disetiap tasking", tidak dibatasi status),
 *   dan otomatis juga berlaku untuk siapa pun yang bisa melihat task itu (Admin/Pemimpin/pemilik/
 *   Pemberi Tugas/penerima delegasi — semuanya sudah lolos canViewTask kalau modal task-nya
 *   bisa dibuka). Tetap butuh izin 'edit' pada menu 'tasking' (dicek terpisah via
 *   requirePermission di layer API).
 * - Edit: HANYA penulis komentar itu sendiri, tanpa pengecualian role apa pun (Admin sekalipun
 *   tidak boleh edit komentar orang lain — meniru persis aplikasi lama).
 * - Hapus: penulis sendiri, ATAU (user dengan izin 'delete' pada 'tasking' DAN task-nya juga
 *   boleh dia kelola/canManageTaskInfo).
 */
export function canReadComments(session: SessionPayload, task: SheetRow): boolean {
  return canViewTask(session, task);
}

export function canAddComment(session: SessionPayload, task: SheetRow): boolean {
  return canViewTask(session, task);
}

export function canEditComment(session: SessionPayload, comment: CommentRow): boolean {
  return comment.user_id === session.userId;
}

export function canDeleteComment(
  session: SessionPayload,
  comment: CommentRow,
  hasDeletePermission: boolean,
  canManageParentTask: boolean
): boolean {
  if (comment.user_id === session.userId) return true;
  return hasDeletePermission && canManageParentTask; // caller wajib hitung canManageParentTask via canManageTaskInfo
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

type UploadedAttachment = {
  driveFileId: string;
  category: AttachmentCategory;
  mimeType: string;
  originalName: string;
  fileSize: number;
};

/** Validasi + upload 1 file lampiran ke Drive — diekstrak dari createComment supaya bisa dipakai
 *  ulang oleh editComment juga (permintaan user: lampiran sekarang bisa diganti lewat edit,
 *  bukan cuma saat komentar pertama kali dibuat). Aturan validasi (sniff MIME + limit ukuran per
 *  kategori) SAMA PERSIS untuk keduanya. */
async function validateAndUploadAttachment(
  file: { buffer: Buffer; originalName: string }
): Promise<{ ok: true; attachment: UploadedAttachment } | { ok: false; error: string }> {
  const sniffed = sniffMimeType(file.buffer);
  if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed.mime)) {
    return { ok: false, error: 'Jenis file tidak didukung. Gunakan gambar, video, PDF, dokumen, atau file teks.' };
  }
  const limit = SIZE_LIMITS_BYTES[sniffed.category];
  if (file.buffer.length > limit) {
    const limitMb = Math.round(limit / (1024 * 1024));
    return { ok: false, error: `Ukuran file terlalu besar. Maksimal ${limitMb}MB untuk tipe ${sniffed.category}.` };
  }

  try {
    const uploaded = await uploadAttachment(file.buffer, sniffed.mime, file.originalName);
    return {
      ok: true,
      attachment: {
        driveFileId: uploaded.driveFileId,
        category: sniffed.category,
        mimeType: sniffed.mime,
        originalName: file.originalName,
        fileSize: uploaded.fileSize,
      },
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

/** Komentar butuh TEKS ATAU LAMPIRAN (tidak wajib keduanya, tapi tidak boleh kosong dua-duanya). */
export async function createComment(input: CreateCommentInput): Promise<CreateCommentResult> {
  const text = input.text.trim();
  if (!text && !input.file) {
    return { ok: false, error: 'Komentar harus berisi teks atau lampiran file.' };
  }

  let attachment: UploadedAttachment | null = null;
  if (input.file) {
    const uploadResult = await validateAndUploadAttachment(input.file);
    if (!uploadResult.ok) return { ok: false, error: uploadResult.error };
    attachment = uploadResult.attachment;
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

export type EditCommentInput = {
  commentId: string;
  newText: string;
  /** Lampiran BARU (kalau diisi, MENGGANTI lampiran lama — lampiran lama otomatis dihapus dari
   *  Drive). Diabaikan kalau `removeAttachment` juga true (file baru selalu menang). */
  file?: { buffer: Buffer; originalName: string } | null;
  /** true = hapus lampiran yang ada, TANPA menggantinya. Diabaikan kalau `file` diisi. */
  removeAttachment?: boolean;
};

export type EditCommentResult = { ok: true; comment: CommentRow } | { ok: false; error: string };

/** Perbaikan (permintaan user): lampiran SEKARANG bisa diganti (upload file baru) atau dihapus
 *  lewat edit komentar juga — desain awal Fase 9 sengaja membatasi edit ke teks saja (meniru
 *  aplikasi lama: "hapus komentar & buat baru" kalau mau ganti lampiran), tapi user eksplisit
 *  minta ini diubah. Kalau `file`/`removeAttachment` TIDAK diisi sama sekali (user cuma edit
 *  teks), lampiran yang ada TIDAK disentuh — perilaku lama utk kasus itu tetap sama persis. */
export async function editComment(input: EditCommentInput): Promise<EditCommentResult> {
  const text = input.newText.trim();
  const existing = (await SheetTable.findById('task_comments', input.commentId)) as CommentRow | undefined;
  if (!existing) return { ok: false, error: 'Komentar tidak ditemukan.' };

  let attachmentPatch: Partial<CommentRow> = {};
  let oldDriveFileIdToDelete: string | null = null;
  let willHaveAttachment = !!existing.attachment_drive_file_id;

  if (input.file) {
    const uploadResult = await validateAndUploadAttachment(input.file);
    if (!uploadResult.ok) return { ok: false, error: uploadResult.error };
    if (existing.attachment_drive_file_id) oldDriveFileIdToDelete = existing.attachment_drive_file_id;
    attachmentPatch = {
      attachment_drive_file_id: uploadResult.attachment.driveFileId,
      attachment_category: uploadResult.attachment.category,
      attachment_mime_type: uploadResult.attachment.mimeType,
      attachment_original_name: uploadResult.attachment.originalName,
      attachment_file_size: String(uploadResult.attachment.fileSize),
    };
    willHaveAttachment = true;
  } else if (input.removeAttachment && existing.attachment_drive_file_id) {
    oldDriveFileIdToDelete = existing.attachment_drive_file_id;
    attachmentPatch = {
      attachment_drive_file_id: '',
      attachment_category: '',
      attachment_mime_type: '',
      attachment_original_name: '',
      attachment_file_size: '',
    };
    willHaveAttachment = false;
  }

  if (!text && !willHaveAttachment) {
    return { ok: false, error: 'Komentar harus berisi teks atau lampiran file.' };
  }

  const updated = (await SheetTable.updateRow('task_comments', input.commentId, {
    comment: text,
    ...attachmentPatch,
  })) as CommentRow;

  // File lama di Drive dihapus SETELAH row berhasil diupdate — best-effort (sama pola dengan
  // deleteComment), tidak menggagalkan response edit kalau penghapusan file lama gagal.
  if (oldDriveFileIdToDelete) {
    await deleteAttachment(oldDriveFileIdToDelete).catch(() => {});
  }

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
