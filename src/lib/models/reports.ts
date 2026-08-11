import * as SheetTable from '@/lib/google/sheet-table';
import type { SheetRow } from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';
import { canViewTask } from './tasks';
import type { EnrichedTask } from '@/lib/reports/types';

/**
 * Ambil semua task yang boleh dilihat session ini (pakai aturan visibilitas Tasks yang sama
 * seperti Fase 2 — canViewTask), lalu "enrich" dengan nama-nama (client, project, status, dst)
 * supaya halaman Report & Dashboard tidak perlu resolve relasi sendiri-sendiri.
 */
export async function getVisibleEnrichedTasks(session: SessionPayload): Promise<EnrichedTask[]> {
  const [tasks, clients, projects, taskTypes, priorities, statuses, users] = await Promise.all([
    SheetTable.getAll('tasks'),
    SheetTable.getAll('clients'),
    SheetTable.getAll('projects'),
    SheetTable.getAll('task_types'),
    SheetTable.getAll('priorities'),
    SheetTable.getAll('statuses'),
    SheetTable.getAll('users'),
  ]);

  const visible = tasks.filter((t) => canViewTask(session, t));

  const byId = (rows: SheetRow[]) => new Map(rows.map((r) => [r.id, r]));
  const clientMap = byId(clients);
  const projectMap = byId(projects);
  const taskTypeMap = byId(taskTypes);
  const priorityMap = byId(priorities);
  const statusMap = byId(statuses);
  const userMap = byId(users);

  const todayStr = new Date().toISOString().slice(0, 10);

  return visible.map((t) => {
    const status = statusMap.get(t.status_id);
    const isFinal = status?.is_final === 'Ya';
    const isOverdue = !!t.due_date && t.due_date < todayStr && !isFinal;

    return {
      id: t.id,
      title: t.title,
      client_id: t.client_id,
      client_name: clientMap.get(t.client_id)?.client_name || '',
      project_id: t.project_id,
      project_name: projectMap.get(t.project_id)?.project_name || '',
      task_type_id: t.task_type_id,
      task_type_name: taskTypeMap.get(t.task_type_id)?.type_name || '',
      priority_id: t.priority_id,
      priority_name: priorityMap.get(t.priority_id)?.priority_name || '',
      status_id: t.status_id,
      status_name: status?.status_name || '',
      is_final: isFinal,
      assigned_to: t.assigned_to,
      assigned_to_name: userMap.get(t.assigned_to)?.name || '',
      assigned_by: t.assigned_by,
      assigned_by_name: userMap.get(t.assigned_by)?.name || '',
      due_date: t.due_date,
      completed_at: t.completed_at,
      created_at: t.created_at,
      is_overdue: isOverdue,
    };
  });
}
