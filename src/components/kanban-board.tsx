'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { TimeTrackingControls, type TimeTrackingState } from '@/components/time-tracking-controls';

type TaskRow = {
  id: string;
  title: string;
  client_id: string;
  project_id: string;
  priority_id: string;
  status_id: string;
  assigned_to: string;
  due_date: string;
  actual_duration_seconds?: string;
  timeTracking?: TimeTrackingState;
};

type Option = { value: string; label: string };
type StatusOption = Option & { isFinal: boolean; isDefault: boolean; isReview: boolean; workflowLevel: number | null };

type OptionsData = {
  canAssignOthers: boolean;
  clients: Option[];
  projects: Option[];
  priorities: Option[];
  statuses: StatusOption[];
  assignees: Option[];
};

function isOverdue(row: TaskRow, statuses: StatusOption[] | undefined): boolean {
  if (!row.due_date) return false;
  const status = statuses?.find((s) => s.value === row.status_id);
  if (status?.isFinal) return false;
  return new Date(row.due_date) < new Date(new Date().toDateString());
}

/**
 * Papan Kanban Task (Fase 8) — kolom per Status diurutkan `workflow_level`, drag-and-drop antar
 * kolom untuk pindah status. Drag dibatasi LEBIH KETAT dari form Edit biasa: cuma boleh geser
 * PERSIS satu tahap maju (flag `viaKanbanDrag` diperiksa server di `PATCH /api/tasks/[id]`) —
 * untuk pindah mundur, pakai halaman List (`/tasks`) yang aturannya Rule B standar (mundur bebas).
 */
export default function KanbanBoard({
  currentUserId,
  isAdmin,
  permissions,
}: {
  currentUserId: string;
  isAdmin: boolean;
  permissions: { canEdit: boolean };
}) {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [opts, setOpts] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, optsRes] = await Promise.all([apiFetch('/api/tasks'), apiFetch('/api/tasks/options')]);
      const tasksJson = await tasksRes.json();
      const optsJson = await optsRes.json();
      if (!tasksRes.ok) throw new Error(tasksJson.error || 'Gagal memuat data.');
      setRows(tasksJson.data);
      setOpts({
        ...optsJson.data,
        statuses: optsJson.data.statuses.map((s: Record<string, unknown>) => ({
          ...s,
          workflowLevel: s.workflow_level !== undefined && s.workflow_level !== '' ? Number(s.workflow_level) : null,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function label(list: Option[] | undefined, value: string) {
    return list?.find((o) => o.value === value)?.label || '-';
  }

  function canManage(row: TaskRow) {
    if (!permissions.canEdit) return false;
    return isAdmin || !!opts?.canAssignOthers || row.assigned_to === currentUserId;
  }

  async function handleDrop(targetStatus: StatusOption) {
    const taskId = dragTaskId;
    setDragTaskId(null);
    setDragOverStatusId(null);
    if (!taskId) return;
    const task = rows.find((r) => r.id === taskId);
    if (!task || task.status_id === targetStatus.value) return;
    if (!canManage(task)) return;

    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_id: targetStatus.value, viaKanbanDrag: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.fieldErrors?.status_id || json.error || 'Gagal memindahkan task.');
        return;
      }
      await load();
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  }

  if (loading) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-400 shadow-sm">Memuat...</div>;
  if (error) return <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!opts) return null;

  const sortedStatuses = [...opts.statuses].sort((a, b) => {
    if (a.workflowLevel === null && b.workflowLevel === null) return a.label.localeCompare(b.label);
    if (a.workflowLevel === null) return 1;
    if (b.workflowLevel === null) return -1;
    return a.workflowLevel - b.workflowLevel;
  });

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4" style={{ minWidth: `${sortedStatuses.length * 280}px` }}>
        {sortedStatuses.map((status) => {
          const columnTasks = rows.filter((r) => r.status_id === status.value);
          const isDropTarget = dragOverStatusId === status.value;
          return (
            <div
              key={status.value}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStatusId(status.value);
              }}
              onDragLeave={() => setDragOverStatusId((cur) => (cur === status.value ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(status);
              }}
              className={`flex w-[280px] shrink-0 flex-col rounded-lg border bg-gray-50 ${
                isDropTarget ? 'border-gray-900' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <h3 className="text-sm font-semibold text-gray-900">{status.label}</h3>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{columnTasks.length}</span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {columnTasks.length === 0 && <p className="px-2 py-4 text-center text-xs text-gray-400">Tidak ada task.</p>}
                {columnTasks.map((row) => {
                  const manageable = canManage(row);
                  const overdue = isOverdue(row, opts.statuses);
                  return (
                    <div
                      key={row.id}
                      draggable={manageable}
                      onDragStart={() => setDragTaskId(row.id)}
                      onDragEnd={() => {
                        setDragTaskId(null);
                        setDragOverStatusId(null);
                      }}
                      className={`rounded-md border border-gray-200 bg-white p-2.5 shadow-sm ${
                        manageable ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${dragTaskId === row.id ? 'opacity-50' : ''}`}
                    >
                      <p className="text-sm font-medium text-gray-900">{row.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                        {row.project_id && <span>{label(opts.projects, row.project_id)}</span>}
                        {row.priority_id && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5">{label(opts.priorities, row.priority_id)}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-gray-500">{label(opts.assignees, row.assigned_to)}</span>
                        {row.due_date && <span className={overdue ? 'font-medium text-red-600' : 'text-gray-400'}>{row.due_date}</span>}
                      </div>
                      <div className="mt-1.5 border-t border-gray-100 pt-1.5">
                        <TimeTrackingControls
                          taskId={row.id}
                          timeTracking={row.timeTracking}
                          status={status}
                          canManage={manageable}
                          onChanged={load}
                          compact
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
