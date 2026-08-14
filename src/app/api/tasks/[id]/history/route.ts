import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canViewTask } from '@/lib/models/tasks';
import { getHistoryForTask } from '@/lib/models/task-history';

/**
 * Riwayat perubahan 1 task (permintaan user poin 4) — read-only, gate sama seperti komentar
 * (canViewTask, siapa pun yang bisa lihat task-nya boleh lihat riwayatnya juga). Dibungkus
 * try/catch: kalau sheet task_history belum dikonfigurasi (SHEET_ID_TASK_HISTORY belum diset)
 * atau Google Sheets API bermasalah, tampilkan pesan jelas ("belum dikonfigurasi") daripada 500
 * mentah — pola sama seperti GET /api/tasks/[id]/comments.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const task = await SheetTable.findById('tasks', id);
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canViewTask(session, task)) {
    return NextResponse.json({ error: 'Anda tidak punya akses ke task ini.' }, { status: 403 });
  }

  try {
    const history = await getHistoryForTask(id);
    const users = await SheetTable.getAll('users');
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return NextResponse.json({
      data: history.map((h) => ({
        id: h.id,
        task_id: h.task_id,
        change_type: h.change_type,
        field_key: h.field_key,
        old_value_label: h.old_value_label,
        new_value_label: h.new_value_label,
        changed_by: h.changed_by,
        changed_by_name: nameById.get(h.changed_by) || '(user tidak ditemukan)',
        created_at: h.created_at,
      })),
    });
  } catch (e) {
    if (e instanceof Error && /belum diset/.test(e.message)) {
      return NextResponse.json(
        { error: 'Fitur Riwayat Perubahan belum dikonfigurasi di server ini. Hubungi admin.' },
        { status: 503 }
      );
    }
    throw e;
  }
}
