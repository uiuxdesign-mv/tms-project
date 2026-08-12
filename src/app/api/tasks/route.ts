import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canViewTask, canAssignToOthers } from '@/lib/models/tasks';
import { logAction } from '@/lib/models/audit-log';
import { getTimeStatesForTasks } from '@/lib/models/time-tracking';

export async function GET(req: NextRequest) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;

  // Bugfix (Fase 19): endpoint ini dipanggil ulang tepat setelah aksi Time Tracking/drag Kanban
  // untuk me-refresh papan/daftar Task — kalau pakai cache in-memory 30 detik yang sama seperti
  // sheet lain (lihat catatan di lib/google/cache.ts), request ini bisa saja dilayani instance
  // serverless Vercel yang BEDA dari yang barusan menulis perubahan, sehingga masih membaca cache
  // basi dan status task terlihat belum pindah kolom padahal sudah tersimpan. Data task berubah
  // sangat sering (tiap aksi Start/Pause/Stop/drag), jadi selalu baca langsung dari Google Sheets
  // di sini demi konsistensi, bukan dari cache.
  //
  // Bugfix susulan: karena sekarang SELALU memanggil Google Sheets API langsung (bukan cache),
  // error transient (rate limit/5xx sesaat) yang sebelumnya jarang muncul jadi lebih sering
  // ketemu — sheet-table.ts sudah retry singkat untuk itu, tapi kalau tetap gagal, di sini WAJIB
  // ditangkap supaya client dapat pesan error JSON yang jelas, bukan respons 500 kosong yang bikin
  // `res.json()` di browser meledak ("Unexpected end of JSON input").
  try {
    const all = await SheetTable.getAll('tasks', { useCache: false });
    let rows = all.filter((t) => canViewTask(session, t));

    const url = new URL(req.url);
    const statusId = url.searchParams.get('status_id');
    const assignee = url.searchParams.get('assigned_to');
    if (statusId) rows = rows.filter((t) => t.status_id === statusId);
    if (assignee) rows = rows.filter((t) => t.assigned_to === assignee);

    // Fase 8 (Time Tracking): sisipkan state Start/Pause/Stop/Review yang sudah di-derive dari
    // event log, supaya UI (tabel Task, nanti Kanban) tidak perlu 1 request terpisah per task.
    const timeStates = await getTimeStatesForTasks(rows.map((t) => t.id), { useCache: false });
    const rowsWithTimeTracking = rows.map((t) => ({ ...t, timeTracking: timeStates[t.id] }));

    return NextResponse.json({ data: rowsWithTimeTracking });
  } catch (err) {
    console.error('GET /api/tasks gagal:', err);
    return NextResponse.json(
      { error: 'Gagal memuat data Task dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('tasking', 'create');
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  const errors: Record<string, string> = {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const clientId = String(body.client_id || '');
  const projectId = String(body.project_id || '');
  const taskTypeId = String(body.task_type_id || '');
  const priorityId = String(body.priority_id || '');
  const statusId = String(body.status_id || '');
  const dueDate = String(body.due_date || '');
  const startDate = String(body.start_date || '');
  const estimatedHoursRaw = body.estimated_hours;
  const estimatedHours =
    estimatedHoursRaw === undefined || estimatedHoursRaw === null || estimatedHoursRaw === ''
      ? ''
      : String(Number(estimatedHoursRaw));

  if (!title) errors.title = 'Judul wajib diisi.';
  if (estimatedHoursRaw !== undefined && estimatedHoursRaw !== null && estimatedHoursRaw !== '' && Number.isNaN(Number(estimatedHoursRaw))) {
    errors.estimated_hours = 'Estimasi jam harus berupa angka.';
  }
  if (!taskTypeId) errors.task_type_id = 'Task Type wajib dipilih.';
  if (!priorityId) errors.priority_id = 'Priority wajib dipilih.';
  if (!statusId) errors.status_id = 'Status wajib dipilih.';

  const taskType = taskTypeId ? await SheetTable.findById('task_types', taskTypeId) : undefined;
  if (taskTypeId && !taskType) errors.task_type_id = 'Task Type tidak ditemukan.';

  let relatedTaskId = '';
  if (taskType?.requires_related_task === 'Ya') {
    relatedTaskId = String(body.related_task_id || '');
    if (!relatedTaskId) {
      errors.related_task_id = 'Tipe tugas ini wajib terhubung ke task lain.';
    } else {
      const relatedTask = await SheetTable.findById('tasks', relatedTaskId);
      if (!relatedTask) errors.related_task_id = 'Task terkait tidak ditemukan.';
    }
  }

  const status = statusId ? await SheetTable.findById('statuses', statusId) : undefined;
  if (statusId && !status) errors.status_id = 'Status tidak ditemukan.';

  // Assignee: dihitung ulang independen di server — request client TIDAK dipercaya begitu saja.
  // Kalau user tidak punya hak canAssignToOthers, task otomatis ditugaskan ke dirinya sendiri
  // berapa pun assigned_to yang dikirim dari client.
  let assignedTo = session.userId;
  if (canAssignToOthers(session)) {
    const requested = String(body.assigned_to || '') || session.userId;
    const assignee = await SheetTable.findById('users', requested);
    if (!assignee) {
      errors.assigned_to = 'User yang ditugaskan tidak ditemukan.';
    } else {
      assignedTo = requested;
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: errors }, { status: 422 });
  }

  const completedAt = status?.is_final === 'Ya' ? new Date().toISOString() : '';

  const row = await SheetTable.insertRow('tasks', {
    title,
    description,
    client_id: clientId,
    project_id: projectId,
    task_type_id: taskTypeId,
    related_task_id: relatedTaskId,
    priority_id: priorityId,
    status_id: statusId,
    assigned_to: assignedTo,
    assigned_by: session.userId,
    due_date: dueDate,
    start_date: startDate,
    estimated_hours: estimatedHours,
    completed_at: completedAt,
  });

  await logAction({
    actorUserId: session.userId,
    actorName: session.name,
    action: 'create',
    entityType: 'tasks',
    entityId: row.id,
    entityLabel: row.title,
  });

  return NextResponse.json({ data: row }, { status: 201 });
}
