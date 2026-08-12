import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canManageTask } from '@/lib/models/tasks';
import { runTimeAction, getTimeStateForTask } from '@/lib/models/time-tracking';
import { logAction } from '@/lib/models/audit-log';

const VALID_ACTIONS = new Set(['start', 'pause', 'resume', 'stop', 'back', 'done', 'cancel']);

/** Ambil state Time Tracking saat ini (dipakai UI untuk hydrate live-ticking badge). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const existing = await SheetTable.findById('tasks', id);
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canManageTask(session, existing)) {
    return NextResponse.json({ error: 'Anda tidak punya akses ke Time Tracking task ini.' }, { status: 403 });
  }

  try {
    const { task, state, events } = await getTimeStateForTask(id);
    return NextResponse.json({ data: { task, state, events } });
  } catch {
    return NextResponse.json(
      { error: 'Sheet Time Tracking (task_time_logs) belum dikonfigurasi di server ini. Hubungi admin.' },
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

  await logAction({
    actorUserId: session.userId,
    actorName: session.name,
    action: 'update',
    entityType: 'task_time_logs',
    entityId: id,
    entityLabel: `${existing.title || id} — Time Tracking: ${action}`,
  });

  return NextResponse.json({ data: { task: result.task, state: result.state, events: result.events } });
}
