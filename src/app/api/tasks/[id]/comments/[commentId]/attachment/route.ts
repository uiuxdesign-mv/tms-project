import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canReadComments, getAttachmentContent, type CommentRow } from '@/lib/models/comments';

/**
 * Proxy download lampiran — file di Drive TIDAK PERNAH dibagikan lewat link publik/Drive
 * langsung. Semua akses harus lewat sini supaya aturan visibilitas task (canReadComments/
 * canViewTask) tetap berlaku untuk lampiran juga, konsisten dengan seluruh app — siapa pun yang
 * bisa melihat task-nya boleh membuka lampiran komentarnya, terlepas dari boleh tidaknya dia
 * mengelola informasi task tersebut.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id, commentId } = await ctx.params;

  // Perbaikan (Round 23): lookup task (untuk cek izin canReadComments) dan lookup komentar (untuk
  // validasi attachment) SALING BEBAS — id task & commentId sama-sama sudah ada dari params, tidak
  // saling butuh hasil satu sama lain. Diparalelkan; kalau task ternyata tidak ada/izin ditolak,
  // hasil comment yang sudah ikut terambil cukup dibuang (trade-off kecil demi mempercepat jalur
  // normal, sama seperti pola paralelisasi lain di Round 22/23).
  const [task, comment] = await Promise.all([
    SheetTable.findById('tasks', id),
    SheetTable.findById('task_comments', commentId) as Promise<CommentRow | undefined>,
  ]);
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canReadComments(session, task)) {
    return NextResponse.json({ error: 'Anda tidak punya akses ke task ini.' }, { status: 403 });
  }

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
