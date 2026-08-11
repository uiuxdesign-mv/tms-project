'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { TimeTrackingControls, type TimeTrackingState } from '@/components/time-tracking-controls';
import TaskComments from '@/components/task-comments';

type TaskRow = {
  id: string;
  title: string;
  description: string;
  client_id: string;
  project_id: string;
  task_type_id: string;
  related_task_id: string;
  priority_id: string;
  status_id: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string;
  completed_at: string;
  actual_duration_seconds?: string;
  timeTracking?: TimeTrackingState;
};

type Option = { value: string; label: string };
type ProjectOption = Option & { clientId: string };
type TaskTypeOption = Option & { requiresRelatedTask: boolean };
type StatusOption = Option & { isFinal: boolean; isDefault: boolean; isReview: boolean };

type OptionsData = {
  canAssignOthers: boolean;
  clients: Option[];
  projects: ProjectOption[];
  taskTypes: TaskTypeOption[];
  priorities: Option[];
  statuses: StatusOption[];
  assignees: Option[];
  relatedTasks: Option[];
};

const emptyForm = {
  title: '',
  description: '',
  client_id: '',
  project_id: '',
  task_type_id: '',
  related_task_id: '',
  priority_id: '',
  status_id: '',
  assigned_to: '',
  due_date: '',
};

type Permissions = { canCreate: boolean; canEdit: boolean; canDelete: boolean };

export default function TasksTable({
  currentUserId,
  isAdmin,
  permissions,
}: {
  currentUserId: string;
  isAdmin: boolean;
  permissions: Permissions;
}) {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [opts, setOpts] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, optsRes] = await Promise.all([apiFetch('/api/tasks'), apiFetch('/api/tasks/options')]);
      const tasksJson = await tasksRes.json();
      const optsJson = await optsRes.json();
      if (!tasksRes.ok) throw new Error(tasksJson.error || 'Gagal memuat data.');
      setRows(tasksJson.data);
      setOpts(optsJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedTaskType = opts?.taskTypes.find((t) => t.value === form.task_type_id);
  const showRelatedTask = !!selectedTaskType?.requiresRelatedTask;

  function openCreateModal() {
    setEditingId(null);
    setForm({ ...emptyForm, assigned_to: opts?.canAssignOthers ? '' : currentUserId });
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEditModal(row: TaskRow) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      description: row.description,
      client_id: row.client_id,
      project_id: row.project_id,
      task_type_id: row.task_type_id,
      related_task_id: row.related_task_id,
      priority_id: row.priority_id,
      status_id: row.status_id,
      assigned_to: row.assigned_to,
      due_date: row.due_date,
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const url = editingId ? `/api/tasks/${editingId}` : '/api/tasks';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else setError(json.error || 'Gagal menyimpan data.');
        return;
      }
      setModalOpen(false);
      await load();
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: TaskRow) {
    if (!confirm(`Hapus task "${row.title}"?`)) return;
    try {
      const res = await apiFetch(`/api/tasks/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Gagal menghapus data.');
        return;
      }
      await load();
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  }

  function label(list: Option[] | undefined, value: string) {
    return list?.find((o) => o.value === value)?.label || '-';
  }

  // Fase 7: disamakan dengan aturan visibilitas server (src/lib/models/tasks.ts) — Admin dan
  // user yang canAssignOthers (setara "Manager" di aplikasi lama) bebas kelola semua task;
  // selain itu (setara "Member") hanya task yang assignee-nya (assigned_to) dirinya sendiri.
  // Digabung dengan izin Menu Access ('tasking' edit/delete) yang dikirim server lewat props.
  function canManage(row: TaskRow) {
    if (!permissions.canEdit) return false;
    return isAdmin || !!opts?.canAssignOthers || row.assigned_to === currentUserId;
  }
  function canDelete(row: TaskRow) {
    if (!permissions.canDelete) return false;
    return isAdmin || !!opts?.canAssignOthers || row.assigned_to === currentUserId;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h1 className="text-lg font-semibold text-gray-900">Tasks</h1>
        {permissions.canCreate && (
          <button
            onClick={openCreateModal}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Tambah Task
          </button>
        )}
      </div>

      {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Judul</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Priority</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Assignee</th>
              <th className="px-4 py-2 font-medium">Due Date</th>
              <th className="px-4 py-2 font-medium">Time Tracking</th>
              <th className="px-4 py-2 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  Belum ada task.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-gray-700">{row.title}</td>
                  <td className="px-4 py-2 text-gray-700">{row.client_id ? label(opts?.clients, row.client_id) : '-'}</td>
                  <td className="px-4 py-2 text-gray-700">{row.project_id ? label(opts?.projects, row.project_id) : '-'}</td>
                  <td className="px-4 py-2 text-gray-700">{label(opts?.priorities, row.priority_id)}</td>
                  <td className="px-4 py-2 text-gray-700">{label(opts?.statuses, row.status_id)}</td>
                  <td className="px-4 py-2 text-gray-700">{label(opts?.assignees, row.assigned_to)}</td>
                  <td className="px-4 py-2 text-gray-700">{row.due_date || '-'}</td>
                  <td className="px-4 py-2">
                    <TimeTrackingControls
                      taskId={row.id}
                      timeTracking={row.timeTracking}
                      status={opts?.statuses.find((s) => s.value === row.status_id)}
                      canManage={canManage(row)}
                      onChanged={load}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {canManage(row) && (
                      <button onClick={() => openEditModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                        Edit
                      </button>
                    )}
                    {canDelete(row) && (
                      <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalOpen && opts && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{editingId ? 'Edit Task' : 'Tambah Task'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Judul *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Deskripsi</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Client</label>
                  <select
                    value={form.client_id}
                    onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Tidak ada --</option>
                    {opts.clients.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Project</label>
                  <select
                    value={form.project_id}
                    onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Tidak ada --</option>
                    {opts.projects
                      .filter((p) => !form.client_id || p.clientId === form.client_id)
                      .map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Task Type *</label>
                <select
                  value={form.task_type_id}
                  onChange={(e) => setForm((f) => ({ ...f, task_type_id: e.target.value, related_task_id: '' }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Pilih Task Type --</option>
                  {opts.taskTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.task_type_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.task_type_id}</p>}
              </div>

              {showRelatedTask && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Task Terkait *</label>
                  <select
                    value={form.related_task_id}
                    onChange={(e) => setForm((f) => ({ ...f, related_task_id: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Pilih Task --</option>
                    {opts.relatedTasks
                      .filter((t) => t.value !== editingId)
                      .map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                  </select>
                  {fieldErrors.related_task_id && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.related_task_id}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Priority *</label>
                  <select
                    value={form.priority_id}
                    onChange={(e) => setForm((f) => ({ ...f, priority_id: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Pilih --</option>
                    {opts.priorities.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.priority_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.priority_id}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Status *</label>
                  <select
                    value={form.status_id}
                    onChange={(e) => setForm((f) => ({ ...f, status_id: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Pilih --</option>
                    {opts.statuses.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.status_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.status_id}</p>}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Assignee</label>
                {opts.canAssignOthers ? (
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Diri sendiri --</option>
                    {opts.assignees.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    Diri sendiri (Anda tidak punya hak menugaskan ke user lain)
                  </p>
                )}
                {fieldErrors.assigned_to && <p className="mt-1 text-xs text-red-600">{fieldErrors.assigned_to}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>

            {editingId && (
              <TaskComments taskId={editingId} currentUserId={currentUserId} canDeleteAny={permissions.canDelete} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
