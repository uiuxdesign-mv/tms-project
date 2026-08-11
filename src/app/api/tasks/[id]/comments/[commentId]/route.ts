import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import * as SheetTable from '@/lib/google/sheet-table';
import { hasMenuPermission } from '@/lib/menu-access/permissions';
import { canEditComment, canDeleteComment, editCommentText, deleteComment, type CommentRow } from '@/lib/models/comments';
import { logAction } from '@/lib/models/audit-log';

/**
 * Edit komentar (Fase 9): SENGAJA pakai requireAuth() biasa, BUKAN requirePermission('tasking','edit')
 * — aturan aplikasi lama adalah "hanya penulis sendiri, tanpa pengecualian role apa pun", tidak
 * bergantung pada izin Menu Access sama sekali (beda dari aturan Tambah komentar yang butuh izin
 * 'edit'). Kalau session bukan penulisnya, ditolak 403 apa pun role/izinnya — termasuk Admin.
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

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  const result = await editCommentText(commentId, String(body.comment ?? ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({
    data: {
      id: result.comment.id,
      comment: result.comment.comment,
      updated_at: result.comment.updated_at,
      edited: true,
    },
  });
}

/**
 * Hapus komentar: penulis sendiri ATAU user dengan izin 'delete' pada menu 'tasking' — dua jalur
 * sekaligus (OR), beda dari PATCH yang murni "penulis saja".
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { commentId } = await ctx.params;

  const existing = (await SheetTable.findById('task_comments', commentId)) as CommentRow | undefined;
  if (!existing) return NextResponse.json({ error: 'Komentar tidak ditemukan.' }, { status: 404 });

  const hasDeletePermission = await hasMenuPermission(session, 'tasking', 'delete');
  if (!canDeleteComment(session, existing, hasDeletePermission)) {
    return NextResponse.json({ error: 'Anda tidak punya akses untuk menghapus komentar ini.' }, { status: 403 });
  }

  await deleteComment(commentId);

  await logAction({
    actorUserId: session.userId,
    actorName: session.name,
    action: 'delete',
    entityType: 'task_comments',
    entityId: commentId,
    entityLabel: existing.comment || existing.attachment_original_name || commentId,
  });

  return NextResponse.json({ ok: true });
}
