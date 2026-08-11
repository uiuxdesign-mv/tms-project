import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canAddComment, getAttachmentContent, type CommentRow } from '@/lib/models/comments';

/**
 * Proxy download lampiran — file di Drive TIDAK PERNAH dibagikan lewat link publik/Drive
 * langsung. Semua akses harus lewat sini supaya aturan visibilitas task (canAddComment/
 * canManageTask) tetap berlaku untuk lampiran juga, konsisten dengan seluruh app.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id, commentId } = await ctx.params;

  const task = await SheetTable.findById('tasks', id);
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canAddComment(session, task)) {
    return NextResponse.json({ error: 'Anda tidak punya akses ke task ini.' }, { status: 403 });
  }

  const comment = (await SheetTable.findById('task_comments', commentId)) as CommentRow | undefined;
  if (!comment || comment.task_id !== id || !comment.attachment_drive_file_id) {
    return NextResponse.json({ error: 'Lampiran tidak ditemukan.' }, { status: 404 });
  }

  try {
    const buffer = await getAttachmentContent(comment);
    const filename = encodeURIComponent(comment.attachment_original_name || 'lampiran');
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': comment.attachment_mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${filename}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Gagal mengambil lampiran dari Google Drive.' }, { status: 502 });
  }
}
