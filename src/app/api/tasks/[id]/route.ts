import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canManageTask, canAssignToOthers } from '@/lib/models/tasks';
import { logAction } from '@/lib/models/audit-log';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('tasking', 'edit');
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const existing = await SheetTable.findById('tasks', id);
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 });
  if (!canManageTask(session, existing)) {
    return NextResponse.json({ error: 'Anda tidak punya akses untuk mengubah task ini.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  const errors: Record<string, string> = {};
  const title = String(body.title ?? existing.title).trim();
  const description = String(body.description ?? existing.description).trim();
  const clientId = String(body.client_id ?? existing.client_id ?? '');
  const projectId = String(body.project_id ?? existing.project_id ?? '');
  const taskTypeId = String(body.task_type_id ?? existing.task_type_id);
  const priorityId = String(body.priority_id ?? existing.priority_id);
  const statusId = String(body.status_id ?? existing.status_id);
  const dueDate = String(body.due_date ?? existing.due_date ?? '');

  if (!title) errors.title = 'Judul wajib diisi.';
  if (!taskTypeId) errors.task_type_id = 'Task Type wajib dipilih.';
  if (!priorityId) errors.priority_id = 'Priority wajib dipilih.';
  if (!statusId) errors.status_id = 'Status wajib dipilih.';

  const taskType = taskTypeId ? await SheetTable.findById('task_types', taskTypeId) : undefined;
  if (taskTypeId && !taskType) errors.task_type_id = 'Task Type tidak ditemukan.';

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

  const status = statusId ? await SheetTable.findById('statuses', statusId) : undefined;
  if (statusId && !status) errors.status_id = 'Status tidak ditemukan.';

  // Reassignment ke user lain hanya diproses kalau session punya hak canAssignToOthers.
  // Kalau tidak, assigned_to dipertahankan seperti semula (bukan dipaksa balik ke diri sendiri,
  // supaya user tanpa hak ini tetap bisa mengubah field lain dari task yang sudah ditugaskan ke dia).
  let assignedTo = String(existing.assigned_to);
  if (canAssignToOthers(session) && body.assigned_to) {
    const requested = String(body.assigned_to);
    const assignee = await SheetTable.findById('users', requested);
    if (!assignee) {
      errors.assigned_to = 'User yang ditugaskan tidak ditemukan.';
    } else {
      assignedTo = requested;
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

  const updated = await SheetTable.updateRow('tasks', id, {
    title,
    description,
    client_id: clientId,
    project_id: projectId,
    task_type_id: taskTypeId,
    related_task_id: relatedTaskId,
    priority_id: priorityId,
    status_id: statusId,
    assigned_to: assignedTo,
    due_date: dueDate,
    completed_at: completedAt,
  });

  await logAction({
    actorUserId: session.userId,
    actorName: session.name,
    action: 'update',
    entityType: 'tasks',
    entityId: id,
    entityLabel: updated?.title || id,
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

  // Sama seperti aturan visibilitas/manage (Fase 7): Admin & canAssignToOthers (setara Manager)
  // boleh hapus task siapa pun; role lain (setara Member) hanya boleh hapus task yang
  // assignee-nya dirinya sendiri — plus tetap wajib punya izin 'delete' di Menu Access (di atas).
  if (!canManageTask(session, existing)) {
    return NextResponse.json({ error: 'Anda tidak punya akses untuk menghapus task ini.' }, { status: 403 });
  }

  await SheetTable.softDeleteRow('tasks', id);

  await logAction({
    actorUserId: session.userId,
    actorName: session.name,
    action: 'delete',
    entityType: 'tasks',
    entityId: id,
    entityLabel: existing.title || id,
  });

  return NextResponse.json({ ok: true });
}
