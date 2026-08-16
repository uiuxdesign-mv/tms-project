import { NextRequest, NextResponse, after } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import * as SheetTable from '@/lib/google/sheet-table';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import { canEditComment, canDeleteComment, editComment, deleteComment, type CommentRow } from '@/lib/models/comments';
import { canManageTaskInfo } from '@/lib/models/tasks';
import { logAction } from '@/lib/models/audit-log';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // sama dengan batas atas di POST route (validasi per-kategori lebih detail di lib/models/comments.ts

/**
 * Edit komentar (Fase 9): SENGAJA pakai requireAuth() biasa, BUKAN requirePermission('tasking','edit')
 * — aturan aplikasi lama adalah "hanya penulis sendiri, tanpa pengecualian role apa pun", tidak
 * bergantung pada izin Menu Access sama sekali (beda dari aturan Tambah komentar yang butuh izin
 * 'edit'). Kalau session bukan penulisnya, ditolak 403 apa pun role/izinnya — termasuk Admin.
 *
 * Perbaikan (permintaan user): body sekarang bisa berupa JSON (edit teks saja, lampiran TIDAK
 * disentuh — perilaku lama) ATAU multipart/form-data (edit teks + GANTI lampiran via field
 * `file`, atau HAPUS lampiran via field `removeAttachment=1`) — sama pola dengan POST di atasnya.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { commentId } = await ctx.params;

  const existing = (await SheetTable.findById('task_comments', commentId)) as CommentRow | undefined;
  if (!existing) return NextResponse.json({ error: 'Komentar tidak ditemukan.' }, { status: 404 });
  if (!canEditComment(session, existing)) {
    return NextResponse.json({ error: 'Anda hanya bisa mengedit komentar milik sendiri.' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') || '';
  let text = '';
  let file: { buffer: Buffer; originalName: string } | null = null;
  let removeAttachment = false;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    text = String(form.get('comment') ?? '');
    removeAttachment = form.get('removeAttachment') === '1';
    const uploaded = form.get('file');
    if (uploaded instanceof File) {
      if (uploaded.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: 'Ukuran file terlalu besar (maks 25MB).' }, { status: 422 });
      }
      const arrayBuffer = await uploaded.arrayBuffer();
      file = { buffer: Buffer.from(arrayBuffer), originalName: uploaded.name || 'lampiran' };
    }
  } else {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });
    text = String(body.comment ?? '');
    removeAttachment = !!body.removeAttachment;
  }

  const result = await editComment({ commentId, newText: text, file, removeAttachment });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({
    data: {
      id: result.comment.id,
      comment: result.comment.comment,
      attachment: result.comment.attachment_drive_file_id
        ? {
            category: result.comment.attachment_category,
            mimeType: result.comment.attachment_mime_type,
            originalName: result.comment.attachment_original_name,
            fileSize: Number(result.comment.attachment_file_size) || 0,
          }
        : null,
      updated_at: result.comment.updated_at,
      edited: true,
    },
  });
}

/**
 * Hapus komentar: penulis sendiri ATAU (user dengan izin 'delete' pada menu 'tasking' DAN task
 * induknya boleh dia kelola/canManageTaskInfo) — dua jalur sekaligus (OR), beda dari PATCH yang
 * murni "penulis saja".
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { commentId } = await ctx.params;

  const existing = (await SheetTable.findById('task_comments', commentId)) as CommentRow | undefined;
  if (!existing) return NextResponse.json({ error: 'Komentar tidak ditemukan.' }, { status: 404 });

  const parentTask = existing.task_id ? await SheetTable.findById('tasks', existing.task_id) : undefined;
  const canManageParentTask = !!parentTask && canManageTaskInfo(session, parentTask);
  const hasDeletePermission = await hasMenuPermission(session, 'tasking', 'delete');
  if (!canDeleteComment(session, existing, hasDeletePermission, canManageParentTask)) {
    return NextResponse.json({ error: 'Anda tidak punya akses untuk menghapus komentar ini.' }, { status: 403 });
  }

  await deleteComment(commentId);

  after(() =>
    logAction({
      actorUserId: session.userId,
      actorName: session.name,
      action: 'delete',
      entityType: 'task_comments',
      entityId: commentId,
      entityLabel: existing.comment || existing.attachment_original_name || commentId,
    })
  );

  return NextResponse.json({ ok: true });
}
