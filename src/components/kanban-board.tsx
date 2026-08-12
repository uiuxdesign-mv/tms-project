'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { TimeTrackingControls, type TimeTrackingState } from '@/components/time-tracking-controls';
import { useToast } from '@/components/toast-provider';
import { Badge } from '@/components/badge';
import { TasksPageHeader } from '@/components/tasks-view-header';
import TaskDetailModal from '@/components/task-detail-modal';
import TaskFilterBar from '@/components/task-filter-bar';

type TaskRow = {
  id: string;
  title: string;
  description?: string;
  client_id: string;
  project_id: string;
  task_type_id?: string;
  priority_id: string;
  status_id: string;
  assigned_to: string;
  due_date: string;
  estimated_hours?: string;
  actual_duration_seconds?: string;
  timeTracking?: TimeTrackingState;
};

type Option = { value: string; label: string };
type StatusOption = Option & {
  isFinal: boolean;
  isDefault: boolean;
  isReview: boolean;
  workflowLevel: number | null;
  colorCode?: string | null;
};

type OptionsData = {
  canAssignOthers: boolean;
  clients: Option[];
  projects: Option[];
  taskTypes: Option[];
  priorities: Option[];
  statuses: StatusOption[];
  assignees: Option[];
};

// Format tanggal "Jul 14" seperti video (kartu Kanban lebih sempit dari List, jadi tidak pakai
// tahun supaya tetap muat satu baris).
function formatShortDate(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initialOf(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

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
  const toast = useToast();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [opts, setOpts] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // Filter Status/Priority/Assignee (permintaan user) — sama seperti List, sekarang pakai
  // komponen bersama `TaskFilterBar` supaya Kanban juga punya kemampuan filter yang sama.
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');

  function applyFilters(next: { status: string; priority: string; assignee: string }) {
    setFilterStatus(next.status);
    setFilterPriority(next.priority);
    setFilterAssignee(next.assignee);
  }

  function resetFilters() {
    setFilterStatus('');
    setFilterPriority('');
    setFilterAssignee('');
  }

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

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !r.title.toLowerCase().includes(term)) return false;
      if (filterStatus && r.status_id !== filterStatus) return false;
      if (filterPriority && r.priority_id !== filterPriority) return false;
      if (filterAssignee && r.assigned_to !== filterAssignee) return false;
      return true;
    });
  }, [rows, search, filterStatus, filterPriority, filterAssignee]);

  function canManage(row: TaskRow) {
    if (!permissions.canEdit) return false;
    return isAdmin || !!opts?.canAssignOthers || row.assigned_to === currentUserId;
  }

  /**
   * Fase 19 (permintaan user, spec Kanban & Time Tracking §8.4 "Drag & Drop Menjalankan Business
   * Rule"): sebelumnya drop di sini SELALU PATCH `status_id` mentah — task pindah kolom, tapi Time
   * Tracking (Work Time/Review Time) & History Log-nya TIDAK ikut berjalan seperti kalau user
   * menekan tombol Start/Stop/Done. Akibatnya kalau task di-drag dari "In Progress" ke "In Review",
   * Work Time tidak pernah berhenti dicatat dan Review Time tidak pernah mulai — timer jadi
   * "menggantung". Sekarang: drag yang valid (lolos aturan "persis satu tahap maju" di bawah) di
   * -route ke aksi Time Tracking yang sepadan (start/stop/done) kalau transisinya cocok, supaya
   * hasil akhirnya SAMA PERSIS dengan klik tombol — PATCH mentah cuma dipakai untuk transisi lain
   * yang tidak mengubah Time Tracking sama sekali (tahap kustom tambahan di luar To Do/In
   * Progress/In Review/Done).
   */
  async function handleDrop(targetStatus: StatusOption) {
    const taskId = dragTaskId;
    setDragTaskId(null);
    setDragOverStatusId(null);
    if (!taskId) return;
    const task = rows.find((r) => r.id === taskId);
    if (!task || task.status_id === targetStatus.value) return;
    if (!canManage(task)) return;

    const currentStatus = opts?.statuses.find((s) => s.value === task.status_id);

    // Validasi "persis satu tahap maju" dicek di client dulu (sama seperti Rule Kanban di server,
    // PATCH /api/tasks/[id]) SEBELUM memutuskan aksi Time Tracking mana yang dijalankan di bawah —
    // supaya drag yang melompat tahap tetap ditolak dengan pesan yang sama seperti sebelumnya,
    // bukan diam-diam "dikoreksi" jadi cuma maju satu tahap tanpa penjelasan.
    const oldLevel = currentStatus?.workflowLevel;
    const newLevel = targetStatus.workflowLevel;
    const bothLevelsSet = oldLevel !== null && oldLevel !== undefined && newLevel !== null && newLevel !== undefined;
    if (!bothLevelsSet || newLevel !== oldLevel + 1) {
      toast.error('Drag di Kanban hanya boleh menggeser task persis satu tahap ke depan. Untuk mundur, gunakan form Edit.');
      return;
    }

    try {
      let res: Response;
      if (currentStatus?.isDefault) {
        // To Do -> In Progress via drag = setara klik "Start".
        res = await apiFetch(`/api/tasks/${taskId}/time-tracking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' }),
        });
      } else if (targetStatus.isReview && !currentStatus?.isReview) {
        // In Progress -> In Review via drag = setara klik "Stop".
        res = await apiFetch(`/api/tasks/${taskId}/time-tracking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' }),
        });
      } else if (currentStatus?.isReview && targetStatus.isFinal) {
        // In Review -> Done via drag = setara klik "Done".
        res = await apiFetch(`/api/tasks/${taskId}/time-tracking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'done' }),
        });
      } else {
        // Transisi lain (tahap kustom tanpa efek Time Tracking) — tetap PATCH biasa seperti semula.
        res = await apiFetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status_id: targetStatus.value, viaKanbanDrag: true }),
        });
      }
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.fieldErrors?.status_id || json.error || 'Gagal memindahkan task.');
        return;
      }
      await load();
      toast.success(`Task dipindahkan ke "${targetStatus.label}".`);
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
    }
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-400 shadow-card">Memuat...</div>;
  if (error) return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!opts) return null;

  const sortedStatuses = [...opts.statuses].sort((a, b) => {
    if (a.workflowLevel === null && b.workflowLevel === null) return a.label.localeCompare(b.label);
    if (a.workflowLevel === null) return 1;
    if (b.workflowLevel === null) return -1;
    return a.workflowLevel - b.workflowLevel;
  });

  return (
    <div>
      <TasksPageHeader
        subtitle="Drag a card to another column to change its status. Click a card to view/edit."
        addTaskHref="/tasks?new=1"
        canCreate={permissions.canEdit}
      />

      {/* Bugfix (permintaan user): search box & filter sekarang digabung dalam satu container
          bordered yang sama seperti di view List — sebelumnya search box di sini berdiri sendiri
          tanpa card pembungkus, dan belum ada filter Status/Priority/Assignee sama sekali. */}
      <div className="mb-3 rounded-2xl border border-gray-200 bg-white shadow-card">
        <TaskFilterBar
          className="p-4"
          search={search}
          onSearchChange={setSearch}
          statuses={opts.statuses}
          priorities={opts.priorities}
          assignees={opts.assignees}
          filterStatus={filterStatus}
          filterPriority={filterPriority}
          filterAssignee={filterAssignee}
          onApply={applyFilters}
          onReset={resetFilters}
        />
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: `${sortedStatuses.length * 280}px` }}>
          {sortedStatuses.map((status) => {
            const columnTasks = visibleRows.filter((r) => r.status_id === status.value);
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
                className={`flex w-[280px] shrink-0 flex-col rounded-xl border transition-colors ${
                  isDropTarget ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: status.colorCode || '#94a3b8' }}
                    />
                    <h3 className="text-sm font-semibold text-gray-900">{status.label}</h3>
                  </div>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">{columnTasks.length}</span>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {columnTasks.length === 0 && <p className="px-2 py-4 text-center text-xs text-gray-400">No tasks</p>}
                  {columnTasks.map((row) => {
                    // Fase 19: task yang statusnya sudah Final (Done/Cancelled) tidak boleh di-drag
                    // sama sekali — konsisten dengan tombol Time Tracking yang juga ikut terkunci
                    // di status final (spec §5.7: "seluruh action button ... tidak dapat digunakan
                    // kembali").
                    const manageable = canManage(row) && !status.isFinal;
                    const overdue = isOverdue(row, opts.statuses);
                    // Meta line "Project · Task Type · Client" seperti video — bagian yang kosong
                    // (mis. Client opsional tidak diisi) dilewati, bukan ditampilkan sebagai "-".
                    const metaParts = [
                      row.project_id ? label(opts.projects, row.project_id) : null,
                      row.task_type_id ? label(opts.taskTypes, row.task_type_id) : null,
                      row.client_id ? label(opts.clients, row.client_id) : null,
                    ].filter(Boolean);
                    const assigneeName = label(opts.assignees, row.assigned_to);
                    return (
                      <div
                        key={row.id}
                        draggable={manageable}
                        onDragStart={() => setDragTaskId(row.id)}
                        onDragEnd={() => {
                          setDragTaskId(null);
                          setDragOverStatusId(null);
                        }}
                        onClick={() => setDetailTaskId(row.id)}
                        className={`cursor-pointer rounded-xl border border-gray-200 bg-white p-2.5 shadow-card transition-colors hover:border-indigo-300 ${
                          manageable ? 'active:cursor-grabbing' : ''
                        } ${dragTaskId === row.id ? 'opacity-50' : ''}`}
                      >
                        <p className="text-sm font-medium text-gray-900">{row.title}</p>
                        {metaParts.length > 0 && (
                          <p className="mt-1 truncate text-xs text-gray-500" title={metaParts.join(' · ')}>
                            {metaParts.join(' · ')}
                          </p>
                        )}
                        {row.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{row.description}</p>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2">
                          {row.priority_id ? (
                            <Badge label={label(opts.priorities, row.priority_id)} tone="neutral" />
                          ) : (
                            <span />
                          )}
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-medium text-white"
                            title={assigneeName}
                          >
                            {initialOf(assigneeName)}
                          </span>
                        </div>

                        {(row.due_date || row.estimated_hours) && (
                          <div className="mt-1.5 flex items-center justify-between text-xs">
                            <span className={overdue ? 'font-medium text-red-600' : 'text-gray-400'}>
                              {row.due_date ? `Due ${formatShortDate(row.due_date)}` : ''}
                            </span>
                            <span className="text-gray-400">
                              {row.estimated_hours ? `Est ${Number(row.estimated_hours).toFixed(2)} h` : ''}
                            </span>
                          </div>
                        )}

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

      {detailTaskId && (
        <TaskDetailModal
          taskId={detailTaskId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          permissions={{ canEdit: permissions.canEdit, canDelete: permissions.canEdit }}
          onClose={() => setDetailTaskId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
