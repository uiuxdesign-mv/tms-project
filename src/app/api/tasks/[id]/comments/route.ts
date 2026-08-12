import { NextRequest, NextResponse, after } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canAddComment, createComment, getCommentsForTask } from '@/lib/models/comments';
import { logAction } from '@/lib/models/audit-log';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const task = await SheetTable.findById('tasks', id);
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canAddComment(session, task)) {
    // canAddComment sama persis dengan aturan visibilitas task (canManageTask) — kalau task ini
    // bahkan tidak boleh dilihat/dikelola oleh session ini, komentarnya juga tidak boleh dibaca.
    return NextResponse.json({ error: 'Anda tidak punya akses ke task ini.' }, { status: 403 });
  }

  // Dibungkus try/catch: kalau sheet task_comments belum dikonfigurasi (env var
  // SHEET_ID_TASK_COMMENTS belum diset — mis. sebelum admin selesai setup Fase 9), tampilkan
  // pesan jelas ("belum dikonfigurasi") daripada 500 mentah — pola sama seperti Time Tracking
  // Fase 8 (getTimeStatesForTasks).
  try {
    const comments = await getCommentsForTask(id);
    const users = await SheetTable.getAll('users');
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return NextResponse.json({
      data: comments.map((c) => ({
        id: c.id,
        task_id: c.task_id,
        user_id: c.user_id,
        user_name: nameById.get(c.user_id) || '(user tidak ditemukan)',
        comment: c.comment,
        attachment: c.attachment_drive_file_id
          ? {
              category: c.attachment_category,
              mimeType: c.attachment_mime_type,
              originalName: c.attachment_original_name,
              fileSize: Number(c.attachment_file_size) || 0,
            }
          : null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        edited: !!c.updated_at && c.updated_at !== c.created_at,
      })),
    });
  } catch (e) {
    if (e instanceof Error && /belum diset/.test(e.message)) {
      return NextResponse.json(
        { error: 'Fitur Komentar belum dikonfigurasi di server ini. Hubungi admin.' },
        { status: 503 }
      );
    }
    throw e;
  }
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // batas atas global (kategori Video) — validasi per-kategori lebih detail di lib/models/comments.ts

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'edit');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const task = await SheetTable.findById('tasks', id);
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canAddComment(session, task)) {
    return NextResponse.json({ error: 'Anda tidak punya akses untuk berkomentar di task ini.' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') || '';
  let text = '';
  let file: { buffer: Buffer; originalName: string } | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    text = String(form.get('comment') ?? '');
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
    text = String(body?.comment ?? '');
  }

  let result: Awaited<ReturnType<typeof createComment>>;
  try {
    result = await createComment({ taskId: id, userId: session.userId, text, file });
  } catch (e) {
    if (e instanceof Error && /belum diset/.test(e.message)) {
      return NextResponse.json(
        { error: 'Fitur Komentar belum dikonfigurasi di server ini. Hubungi admin.' },
        { status: 503 }
      );
    }
    throw e;
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  after(() =>
    logAction({
      actorUserId: session.userId,
      actorName: session.name,
      action: 'create',
      entityType: 'task_comments',
      entityId: result.comment.id,
      entityLabel: `Komentar pada task "${task.title}"`,
    })
  );

  return NextResponse.json(
    {
      data: {
        id: result.comment.id,
        task_id: result.comment.task_id,
        user_id: result.comment.user_id,
        user_name: session.name,
        comment: result.comment.comment,
        attachment: result.comment.attachment_drive_file_id
          ? {
              category: result.comment.attachment_category,
              mimeType: result.comment.attachment_mime_type,
              originalName: result.comment.attachment_original_name,
              fileSize: Number(result.comment.attachment_file_size) || 0,
            }
          : null,
        created_at: result.comment.created_at,
        updated_at: result.comment.updated_at,
        edited: false,
      },
    },
    { status: 201 }
  );
}
