import { NextRequest, NextResponse, after } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canManageTask, canViewTask } from '@/lib/models/tasks';
import { runTimeAction, getTimeStateForTask } from '@/lib/models/time-tracking';
import { logAction } from '@/lib/models/audit-log';

const VALID_ACTIONS = new Set(['start', 'pause', 'resume', 'stop', 'back', 'done', 'cancel']);

/** Ambil state Time Tracking saat ini (dipakai UI untuk hydrate live-ticking badge). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  // Bugfix (Fase 19): sama seperti GET /api/tasks & /api/tasks/[id] — endpoint ini dipanggil ulang
  // tepat setelah aksi Start/Pause/Resume/Stop untuk hydrate badge live-ticking, jadi harus baca
  // langsung dari Google Sheets (lewati cache in-memory 30 detik) supaya tidak menampilkan state
  // basi kalau request ini kebetulan dilayani instance serverless yang beda dari yang barusan menulis.
  // Semuanya dibungkus 1 try/catch (bukan cuma getTimeStateForTask seperti sebelumnya) supaya
  // findById di atas juga tidak bisa bikin respons 500 kosong kalau Google Sheets API bermasalah.
  try {
    const existing = await SheetTable.findById('tasks', id, { useCache: false });
    if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
    // Bugfix (permintaan user, fitur Leader Role): MEMBACA state Time Tracking (badge, History
    // Log) cukup aturan visibilitas (canViewTask) — task view-only tetap boleh dilihat riwayat
    // Time Tracking-nya, cuma tidak boleh menjalankan aksi apa pun (POST di bawah tetap pakai
    // canManageTask, tidak berubah).
    if (!canViewTask(session, existing)) {
      return NextResponse.json({ error: 'Anda tidak punya akses ke Time Tracking task ini.' }, { status: 403 });
    }

    const { task, state, events } = await getTimeStateForTask(id, { useCache: false });
    return NextResponse.json({ data: { task, state, events } });
  } catch (err) {
    console.error(`GET /api/tasks/${id}/time-tracking gagal:`, err);
    return NextResponse.json(
      { error: 'Sheet Time Tracking (task_time_logs) belum dikonfigurasi, atau Google Sheets API sedang bermasalah. Coba lagi / hubungi admin.' },
      { status: 503 }
    );
  }
}

/** Jalankan 1 aksi Time Tracking: start | pause | resume | stop | back | done | cancel. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'edit');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const existing = await SheetTable.findById('tasks', id);
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canManageTask(session, existing)) {
    return NextResponse.json({ error: 'Anda tidak punya akses untuk mengubah Time Tracking task ini.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Aksi Time Tracking tidak valid.' }, { status: 400 });
  }

  let result;
  try {
    result = await runTimeAction(id, session.userId, action);
  } catch {
    return NextResponse.json(
      { error: 'Sheet Time Tracking (task_time_logs) belum dikonfigurasi di server ini. Hubungi admin.' },
      { status: 503 }
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  after(() =>
    logAction({
      actorUserId: session.userId,
      actorName: session.name,
      action: 'update',
      entityType: 'task_time_logs',
      entityId: id,
      entityLabel: `${existing.title || id} — Time Tracking: ${action}`,
    })
  );

  return NextResponse.json({ data: { task: result.task, state: result.state, events: result.events } });
}
