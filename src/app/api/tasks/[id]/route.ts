import { NextRequest, NextResponse, after } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import {
  canViewTask,
  canManageTaskInfo,
  canEditTaskFieldsNow,
  canDeleteTask,
  canOperateTimeTracking,
  canAssignToOthers,
  canAssignTaskTo,
} from '@/lib/models/tasks';
import { findRoleById } from '@/lib/models/roles';
import { logAction } from '@/lib/models/audit-log';
import { getTimeStatesForTasks } from '@/lib/models/time-tracking';
import { getDefaultStatusId } from '@/lib/models/statuses';
import { logTaskFieldDiffs, resolveEntityLabel } from '@/lib/models/task-history';

/** Ambil 1 task by id (Fase 10 — dipakai Task Detail Modal saat dibuka dari klik kartu Kanban,
 *  yang cuma punya rows list ringkas hasil GET /api/tasks tanpa perlu prop-drilling penuh). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  // Bugfix (Fase 19): sama seperti GET /api/tasks (list) — modal ini di-reload tepat setelah aksi
  // Time Tracking, jadi cache in-memory 30 detik yang bisa beda per-instance serverless Vercel
  // harus dilewati di sini supaya status/waktu yang ditampilkan selalu yang terbaru. Dibungkus
  // try/catch supaya error transient Google Sheets API (setelah retry di sheet-table.ts tetap
  // gagal) menghasilkan pesan JSON yang jelas, bukan respons 500 kosong.
  try {
    const existing = await SheetTable.findById('tasks', id, { useCache: false });
    if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
    if (!canViewTask(session, existing)) {
      return NextResponse.json({ error: 'Anda tidak punya akses ke task ini.' }, { status: 403 });
    }

    // Bugfix (permintaan user, item detail tasking): resolusi nama "Pemberi Tugas" (assigned_by)
    // dilakukan di server, bukan lewat daftar opsi Assignee di client — pemberi tugas bisa saja
    // Admin/Pemimpin, yang SENGAJA dikecualikan dari daftar opsi Assignee (mereka tidak boleh
    // ditugaskan task), jadi namanya tidak akan ketemu kalau di-resolve dari opts.assignees di
    // client. Field ini kosong ('') kalau task bukan hasil penunjukan tugas (self-assigned).
    const assignedByName = existing.assigned_by
      ? (await SheetTable.findById('users', existing.assigned_by))?.name || ''
      : '';

    const timeStates = await getTimeStatesForTasks([id], { useCache: false });

    // Perbaikan (permintaan user, perbaikan Leader & Pemberi Tugas): sama seperti GET /api/tasks
    // (list) — flag izin dihitung di server & disisipkan langsung, supaya task-detail-modal.tsx
    // tidak perlu lagi menghitung ulang aturan izin sendiri secara terpisah dari list/Kanban.
    // Perbaikan (permintaan user, item optimasi loading): sama seperti GET /api/tasks — status
    // default jarang berubah, cukup pakai cache 30 detik.
    const defaultStatusId = await getDefaultStatusId();
    const isDefaultStatus = !!defaultStatusId && existing.status_id === defaultStatusId;

    return NextResponse.json({
      data: {
        ...existing,
        assigned_by_name: assignedByName,
        timeTracking: timeStates[id],
        can_manage_info: canManageTaskInfo(session, existing),
        can_edit_fields_now: canEditTaskFieldsNow(session, existing, isDefaultStatus),
        can_delete: canDeleteTask(session, existing, isDefaultStatus),
        can_operate_time_tracking: canOperateTimeTracking(session, existing),
      },
    });
  } catch (err) {
    console.error(`GET /api/tasks/${id} gagal:`, err);
    return NextResponse.json(
      { error: 'Gagal memuat data Task dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'edit');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const existing = await SheetTable.findById('tasks', id);
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  // Perbaikan (permintaan user, perbaikan Leader & Pemberi Tugas + perbaikan susulan): dua jalur
  // otorisasi berbeda tergantung jenis perubahan yang diminta —
  // (a) drag Kanban (viaKanbanDrag, cuma mengubah status_id) cukup canOperateTimeTracking, supaya
  //     penerima delegasi tetap bisa menggeser kartu tugasnya sendiri (tetap boleh ubah status),
  //     dan
  // (b) edit informasi task lewat form (field apa pun selain status) butuh canManageTaskInfo, LALU
  //     ditegakkan lebih lanjut lewat canEditTaskFieldsNow — begitu task melewati status awal,
  //     TERKUNCI untuk SIAPA PUN tanpa kecuali (termasuk Admin/Pemimpin/pemilik task, bukan cuma
  //     Pemberi Tugas — permintaan user eksplisit). Sebelumnya pembatasan status-awal ini HANYA
  //     ada di client (disabled input), sekarang divalidasi ulang di server juga.
  const isKanbanStatusOnly = body.viaKanbanDrag === true;
  let isDefaultStatusForGate = false;
  if (isKanbanStatusOnly) {
    if (!canOperateTimeTracking(session, existing)) {
      return NextResponse.json({ error: 'Anda tidak punya akses untuk mengubah status task ini.' }, { status: 403 });
    }
  } else {
    if (!canManageTaskInfo(session, existing)) {
      return NextResponse.json({ error: 'Anda tidak punya akses untuk mengubah task ini.' }, { status: 403 });
    }
    const defaultStatusId = await getDefaultStatusId();
    isDefaultStatusForGate = !!defaultStatusId && existing.status_id === defaultStatusId;
    if (!canEditTaskFieldsNow(session, existing, isDefaultStatusForGate)) {
      return NextResponse.json(
        { error: 'Task ini sudah tidak di status awal lagi, informasinya tidak bisa diubah. Anda tetap bisa menambahkan komentar.' },
        { status: 403 }
      );
    }
  }

  const errors: Record<string, string> = {};
  const title = String(body.title ?? existing.title).trim();
  const description = String(body.description ?? existing.description).trim();
  const clientId = String(body.client_id ?? existing.client_id ?? '');
  const projectId = String(body.project_id ?? existing.project_id ?? '');
  const taskTypeId = String(body.task_type_id ?? existing.task_type_id);
  const priorityId = String(body.priority_id ?? existing.priority_id);
  const statusId = String(body.status_id ?? existing.status_id);
  const dueDate = String(body.due_date ?? existing.due_date ?? '');
  const startDate = String(body.start_date ?? existing.start_date ?? '');
  const estimatedHoursRaw = body.estimated_hours ?? existing.estimated_hours;
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

  // Bugfix (permintaan user, item speed): taskType, status, dan assignee SALING INDEPENDEN —
  // sebelumnya berurutan, sekarang paralel.
  const wantsReassign = canAssignToOthers(session) && !!body.assigned_to;
  const [taskType, status, assignee] = await Promise.all([
    taskTypeId ? SheetTable.findById('task_types', taskTypeId) : Promise.resolve(undefined),
    statusId ? SheetTable.findById('statuses', statusId) : Promise.resolve(undefined),
    wantsReassign ? SheetTable.findById('users', String(body.assigned_to)) : Promise.resolve(undefined),
  ]);
  if (taskTypeId && !taskType) errors.task_type_id = 'Task Type tidak ditemukan.';
  if (statusId && !status) errors.status_id = 'Status tidak ditemukan.';

  let relatedTaskId = String(existing.related_task_id ?? '');
  if (taskType?.requires_related_task === 'Ya') {
    relatedTaskId = String(body.related_task_id ?? existing.related_task_id ?? '');
    if (!relatedTaskId) {
      errors.related_task_id = 'Tipe tugas ini wajib terhubung ke task lain.';
    } else if (relatedTaskId === id) {
      errors.related_task_id = 'Task tidak bisa terhubung ke dirinya sendiri.';
    } else {
      const relatedTask = await SheetTable.findById('tasks', relatedTaskId);
      if (!relatedTask) errors.related_task_id = 'Task terkait tidak ditemukan.';
    }
  } else {
    relatedTaskId = '';
  }

  // Reassignment ke user lain hanya diproses kalau session punya hak canAssignToOthers.
  // Kalau tidak, assigned_to dipertahankan seperti semula (bukan dipaksa balik ke diri sendiri,
  // supaya user tanpa hak ini tetap bisa mengubah field lain dari task yang sudah ditugaskan ke dia).
  let assignedTo = String(existing.assigned_to);
  // assigned_by HANYA disentuh kalau assignee-nya benar-benar BERUBAH (penunjukan tugas baru) —
  // kalau client resend assigned_to yang sama seperti sebelumnya (mis. cuma mengubah field lain
  // di form), assigned_by yang sudah tersimpan TIDAK boleh tertimpa oleh siapa pun yang kebetulan
  // sedang mengedit (permintaan user, item detail tasking).
  let assignedBy = String(existing.assigned_by ?? '');
  if (wantsReassign) {
    if (!assignee) {
      errors.assigned_to = 'User yang ditugaskan tidak ditemukan.';
    } else {
      const newAssigneeId = String(body.assigned_to);
      if (newAssigneeId !== assignedTo) {
        // Perbaikan (permintaan user): dicek ulang di server lewat canAssignTaskTo, sama seperti
        // POST /api/tasks — lihat catatan lengkap di src/lib/models/tasks.ts.
        const assigneeRole = assignee.role_id ? await findRoleById(String(assignee.role_id)) : undefined;
        if (!canAssignTaskTo(session, newAssigneeId, assigneeRole)) {
          errors.assigned_to = 'Anda tidak punya izin menugaskan task ke user ini.';
        } else {
          assignedTo = newAssigneeId;
          assignedBy = assignedTo !== session.userId ? session.userId : '';
        }
      }
    }
  }

  // Validasi workflow (Fase 7) — meniru Task::moveStatus() di aplikasi lama. Hanya berlaku kalau
  // status benar-benar berubah dari sebelumnya.
  if (!errors.status_id && status && statusId !== existing.status_id) {
    const existingStatus = await SheetTable.findById('statuses', existing.status_id);

    // Rule A: status akhir (is_final) wajib punya assignee.
    if (status.is_final === 'Ya' && !assignedTo) {
      errors.status_id = 'Status akhir wajib memiliki assignee.';
    }

    // Rule B: tidak boleh melompati workflow_level lebih dari 1 tahap maju (mundur bebas).
    // Status dengan workflow_level kosong (mis. "Cancelled") dikecualikan dari cek ini di
    // kedua sisi, sama seperti aplikasi lama.
    if (!errors.status_id) {
      const oldLevel = Number(existingStatus?.workflow_level);
      const newLevel = Number(status.workflow_level);
      const bothLevelsSet =
        existingStatus?.workflow_level && status.workflow_level && Number.isFinite(oldLevel) && Number.isFinite(newLevel);
      if (bothLevelsSet && newLevel > oldLevel + 1) {
        errors.status_id = `Tidak bisa melompati urutan status. Dari "${existingStatus?.status_name}" harus ke tahap berikutnya dulu, tidak bisa langsung ke "${status.status_name}".`;
      }

      // Rule Kanban (Fase 8, lebih ketat dari Rule B umum): drag-and-drop di papan Kanban cuma
      // boleh menggeser task PERSIS satu tahap maju — mundur lewat drag tidak diizinkan (kalau
      // perlu mundur, pakai form Edit biasa yang aturannya lebih longgar/Rule B standar).
      // Dikirim via flag `viaKanbanDrag` dari client papan Kanban, tidak memengaruhi form Edit.
      if (!errors.status_id && body.viaKanbanDrag === true) {
        if (!bothLevelsSet || newLevel !== oldLevel + 1) {
          errors.status_id = 'Drag di Kanban hanya boleh menggeser task persis satu tahap ke depan. Untuk mundur, gunakan form Edit.';
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: errors }, { status: 422 });
  }

  const wasFinal = status?.is_final === 'Ya';
  const completedAt = wasFinal ? existing.completed_at || new Date().toISOString() : '';

  // Perbaikan (permintaan user, item concurrency — "beberapa user tidak sengaja melakukan update
  // data secara bersamaan"): client mengirim `expected_updated_at` (nilai updated_at task yang dia
  // lihat saat modal dibuka, lihat task-detail-modal.tsx) — kalau ternyata sudah beda dari yang
  // tersimpan sekarang (ada yang menyimpan duluan), updateRow menolak dengan OptimisticLockError
  // alih-alih menimpa diam-diam. Opsional & backward-compatible: kalau client tidak mengirimnya
  // (mis. request lama sebelum deploy ini), sama sekali tidak diperiksa seperti sebelumnya.
  let updated: SheetTable.SheetRow | undefined;
  try {
    updated = await SheetTable.updateRow(
      'tasks',
      id,
      {
        title,
        description,
        client_id: clientId,
        project_id: projectId,
        task_type_id: taskTypeId,
        related_task_id: relatedTaskId,
        priority_id: priorityId,
        status_id: statusId,
        assigned_to: assignedTo,
        assigned_by: assignedBy,
        due_date: dueDate,
        start_date: startDate,
        estimated_hours: estimatedHours,
        completed_at: completedAt,
      },
      typeof body.expected_updated_at === 'string' ? { expectedUpdatedAt: body.expected_updated_at } : undefined
    );
  } catch (e) {
    if (e instanceof SheetTable.OptimisticLockError) {
      return NextResponse.json(
        {
          error:
            'Task ini sudah diubah oleh user lain sejak Anda membuka halaman ini. Muat ulang untuk melihat perubahan terbaru, lalu simpan ulang perubahan Anda.',
          conflict: true,
        },
        { status: 409 }
      );
    }
    throw e;
  }

  after(() =>
    logAction({
      actorUserId: session.userId,
      actorName: session.name,
      action: 'update',
      entityType: 'tasks',
      entityId: id,
      entityLabel: updated?.title || id,
    })
  );

  // Log history (permintaan user poin 4): catat siapa & kapan tiap field berubah, termasuk
  // perubahan status lewat drag Kanban (change_type 'status'). Dijalankan di after() (tidak
  // menunggu, tidak memperlambat response) dan dibungkus try/catch tambahan di sini walau
  // logTaskFieldDiffs/logTaskChange sendiri sudah fire-and-forget — jaga-jaga error tak terduga
  // (mis. resolveEntityLabel gagal) tidak pernah bocor ke luar after().
  after(async () => {
    try {
      await logTaskFieldDiffs(id, session.userId, [
        { fieldKey: 'title', changeType: 'field', oldValue: existing.title || '', newValue: title },
        { fieldKey: 'description', changeType: 'field', oldValue: existing.description || '', newValue: description },
        {
          fieldKey: 'client_id',
          changeType: 'field',
          oldValue: existing.client_id || '',
          newValue: clientId,
          resolveLabel: (v) => resolveEntityLabel('clients', 'client_name', v),
        },
        {
          fieldKey: 'project_id',
          changeType: 'field',
          oldValue: existing.project_id || '',
          newValue: projectId,
          resolveLabel: (v) => resolveEntityLabel('projects', 'project_name', v),
        },
        {
          fieldKey: 'task_type_id',
          changeType: 'field',
          oldValue: existing.task_type_id || '',
          newValue: taskTypeId,
          resolveLabel: (v) => resolveEntityLabel('task_types', 'type_name', v),
        },
        {
          fieldKey: 'priority_id',
          changeType: 'field',
          oldValue: existing.priority_id || '',
          newValue: priorityId,
          resolveLabel: (v) => resolveEntityLabel('priorities', 'priority_name', v),
        },
        {
          fieldKey: 'assigned_to',
          changeType: 'field',
          oldValue: existing.assigned_to || '',
          newValue: assignedTo,
          resolveLabel: (v) => resolveEntityLabel('users', 'name', v),
        },
        { fieldKey: 'due_date', changeType: 'field', oldValue: existing.due_date || '', newValue: dueDate },
        { fieldKey: 'start_date', changeType: 'field', oldValue: existing.start_date || '', newValue: startDate },
        { fieldKey: 'estimated_hours', changeType: 'field', oldValue: existing.estimated_hours || '', newValue: estimatedHours },
        {
          fieldKey: 'related_task_id',
          changeType: 'field',
          oldValue: existing.related_task_id || '',
          newValue: relatedTaskId,
          resolveLabel: (v) => resolveEntityLabel('tasks', 'title', v),
        },
        {
          fieldKey: 'status_id',
          changeType: 'status',
          oldValue: existing.status_id || '',
          newValue: statusId,
          resolveLabel: (v) => resolveEntityLabel('statuses', 'status_name', v),
        },
      ]);
    } catch (e) {
      console.error('[task-history] gagal mencatat diff PATCH /api/tasks/[id]:', e);
    }
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'delete');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const existing = await SheetTable.findById('tasks', id);
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });

  // Aturan hapus (lihat canDeleteTask di src/lib/models/tasks.ts, permintaan user poin 2):
  // Admin/Pemimpin/pemilik task sendiri bebas status (perilaku lama dipertahankan); "Pemberi
  // Tugas" HANYA boleh menghapus selagi task masih di status awal; penerima delegasi tidak
  // pernah boleh menghapus — plus tetap wajib punya izin 'delete' di Menu Access (di atas).
  const defaultStatusId = await getDefaultStatusId();
  const isDefaultStatus = !!defaultStatusId && existing.status_id === defaultStatusId;
  if (!canDeleteTask(session, existing, isDefaultStatus)) {
    return NextResponse.json({ error: 'Anda tidak punya akses untuk menghapus task ini.' }, { status: 403 });
  }

  await SheetTable.softDeleteRow('tasks', id);

  after(() =>
    logAction({
      actorUserId: session.userId,
      actorName: session.name,
      action: 'delete',
      entityType: 'tasks',
      entityId: id,
      entityLabel: existing.title || id,
    })
  );

  return NextResponse.json({ ok: true });
}
