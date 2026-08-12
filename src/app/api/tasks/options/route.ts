import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canViewTask, canAssignToOthers } from '@/lib/models/tasks';

export async function GET() {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const [clients, projects, taskTypes, priorities, statuses, users, tasks] = await Promise.all([
    SheetTable.getAll('clients'),
    SheetTable.getAll('projects'),
    SheetTable.getAll('task_types'),
    SheetTable.getAll('priorities'),
    SheetTable.getAll('statuses'),
    SheetTable.getAll('users'),
    SheetTable.getAll('tasks'),
  ]);

  const allowAssignOthers = canAssignToOthers(session);
  const assigneeOptions = allowAssignOthers
    ? users.filter((u) => u.status === 'Active').map((u) => ({ value: u.id, label: u.name }))
    : users.filter((u) => u.id === session.userId).map((u) => ({ value: u.id, label: u.name }));

  const visibleTasks = tasks.filter((t) => canViewTask(session, t));

  return NextResponse.json({
    data: {
      canAssignOthers: allowAssignOthers,
      clients: clients.filter((c) => c.status === 'Active').map((c) => ({ value: c.id, label: c.client_name })),
      // Bugfix (Fase 13): sebelumnya `projects` TIDAK difilter status seperti clients/taskTypes/
      // priorities/statuses di bawah — project yang sudah di-nonaktifkan lewat Master Data masih
      // muncul & bisa dipilih di form Add/Edit Task. Disamakan dengan pola field lain di sini.
      projects: projects
        .filter((p) => p.status === 'Active')
        .map((p) => ({ value: p.id, label: p.project_name, clientId: p.client_id })),
      taskTypes: taskTypes
        .filter((t) => t.status === 'Active')
        .map((t) => ({ value: t.id, label: t.type_name, requiresRelatedTask: t.requires_related_task === 'Ya' })),
      priorities: priorities.filter((p) => p.status === 'Active').map((p) => ({ value: p.id, label: p.priority_name })),
      statuses: statuses
        .filter((s) => s.is_active === 'Ya')
        .map((s) => ({
          value: s.id,
          label: s.status_name,
          isFinal: s.is_final === 'Ya',
          isDefault: s.is_default === 'Ya',
          isReview: s.is_review === 'Ya',
          workflow_level: s.workflow_level,
          colorCode: s.color_code || null,
        })),
      assignees: assigneeOptions,
      relatedTasks: visibleTasks.map((t) => ({ value: t.id, label: t.title })),
    },
  });
}
