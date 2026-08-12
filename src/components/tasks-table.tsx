'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/csrf-client';
import type { TimeTrackingState } from '@/components/time-tracking-controls';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useTableControls } from '@/lib/hooks/use-table-controls';
import { SortableHeader, PaginationBar } from '@/components/table-controls';
import { Badge } from '@/components/badge';
import { TasksPageHeader } from '@/components/tasks-view-header';
import TaskDetailModal from '@/components/task-detail-modal';
import TaskFilterBar from '@/components/task-filter-bar';
import { useLanguage } from '@/components/language-provider';

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
  start_date?: string;
  estimated_hours?: string;
  completed_at: string;
  actual_duration_seconds?: string;
  timeTracking?: TimeTrackingState;
};

type Option = { value: string; label: string };
type ClientOption = Option & { projectIds: string[] };
type ProjectOption = Option & { clientId: string };
type TaskTypeOption = Option & { requiresRelatedTask: boolean };
type StatusOption = Option & { isFinal: boolean; isDefault: boolean; isReview: boolean; colorCode?: string | null };

type OptionsData = {
  canAssignOthers: boolean;
  clients: ClientOption[];
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
  start_date: '',
  estimated_hours: '',
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
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [opts, setOpts] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Filter Status/Priority/Assignee (Fase 10 — video-fidelity pass, UI-nya sekarang di komponen
  // bersama `TaskFilterBar`, dipakai juga oleh Kanban & Calendar — permintaan user). Nilai yang
  // sudah DITERAPKAN (bukan draft — draft-nya ada di dalam TaskFilterBar sendiri) disimpan di sini
  // karena `filteredRows` di bawah butuh nilainya.
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

  // Bugfix (permintaan user, item loading-flicker): sama seperti kanban-board.tsx/calendar-view.tsx
  // — reload setelah aksi di modal (`onChanged`) sekarang diam-diam (`silent: true`), baris tabel
  // tidak lagi diganti "Memuat..." setiap kali user selesai mengubah task dari modal.
  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const silentReload = useCallback(() => load({ silent: true }), [load]);

  // Kanban & Calendar (Fase 10) tidak punya form Tambah Task sendiri — tombol "+ Add Task" di
  // sana mengarah ke /tasks?new=1 supaya modal yang sama (satu-satunya implementasi) langsung
  // terbuka di sini, lalu query string dibersihkan supaya tidak terbuka lagi kalau halaman di-refresh.
  useEffect(() => {
    if (searchParams.get('new') === '1' && opts) {
      openCreateModal();
      router.replace('/tasks');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, opts]);

  const selectedTaskType = opts?.taskTypes.find((t) => t.value === form.task_type_id);
  const showRelatedTask = !!selectedTaskType?.requiresRelatedTask;

  // Bugfix (permintaan user): Client sekarang wajib dipilih LEBIH DULU di form Add Task, dan
  // daftar Project otomatis terfilter mengikuti Project yang ditautkan ke Client tersebut (diatur
  // lewat field multi-select "Project Terkait" di Master Client). Kalau Client yang dipilih belum
  // ditautkan ke Project manapun (mis. data lama sebelum fitur ini ada), daftar Project TIDAK
  // dikosongkan total — semua Project tetap ditampilkan (fail-open) supaya user tidak terkunci
  // total dari membuat Task sebelum admin sempat mengisi tautan Client-Project di Master Data.
  const selectedClientForTask = opts?.clients.find((c) => c.value === form.client_id);
  const projectOptionsForTask = !form.client_id
    ? []
    : !selectedClientForTask || selectedClientForTask.projectIds.length === 0
      ? opts?.projects || []
      : (opts?.projects || []).filter((p) => selectedClientForTask.projectIds.includes(p.value));

  function openCreateModal() {
    setEditingId(null);
    // Status tidak ditampilkan di form Tambah Task (task baru selalu mulai dari status default
    // workflow, sama seperti video) — dipilih otomatis di sini, field-nya baru muncul lagi kalau
    // user membuka form Edit.
    const defaultStatus = opts?.statuses.find((s) => s.isDefault);
    setForm({
      ...emptyForm,
      assigned_to: opts?.canAssignOthers ? '' : currentUserId,
      status_id: defaultStatus?.value || '',
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  // Detail (List) & klik kartu (Kanban) sama-sama membuka TaskDetailModal (Fase 10) — modal itu
  // fetch datanya sendiri lewat GET /api/tasks/[id], jadi di sini cukup set id-nya saja, tidak
  // perlu lagi prefill `form` seperti form Tambah Task yang sederhana.
  function openEditModal(row: TaskRow) {
    setEditingId(row.id);
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
        else toast.error(json.error || 'Gagal menyimpan data.');
        return;
      }
      setModalOpen(false);
      await load({ silent: true });
      toast.success(editingId ? 'Perubahan task berhasil disimpan.' : 'Task baru berhasil ditambahkan.');
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: TaskRow) {
    const ok = await confirmDialog({ message: `Hapus task "${row.title}"?`, confirmLabel: 'Hapus', danger: true });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/tasks/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Gagal menghapus data.');
        return;
      }
      await load({ silent: true });
      toast.success(`Task "${row.title}" berhasil dihapus.`);
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
    }
  }

  function label(list: Option[] | undefined, value: string) {
    return list?.find((o) => o.value === value)?.label || '-';
  }

  // Filter dropdown (ikon filter di sebelah search box, seperti video) — diterapkan SEBELUM masuk
  // ke useTableControls, jadi search/sort/pagination tetap bekerja di atas hasil yang sudah difilter.
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterStatus && r.status_id !== filterStatus) return false;
      if (filterPriority && r.priority_id !== filterPriority) return false;
      if (filterAssignee && r.assigned_to !== filterAssignee) return false;
      return true;
    });
  }, [rows, filterStatus, filterPriority, filterAssignee]);

  // Fase 10: search/sort/pagination — search di judul & deskripsi (satu-satunya kolom teks bebas
  // di Task; kolom lain seperti Client/Priority/Status berupa ID yang di-resolve ke label lewat
  // `opts`, jadi tidak ikut disertakan supaya pencarian tidak mencocokkan ID mentah yang tidak
  // berarti apa-apa bagi user).
  const table = useTableControls(filteredRows, { searchFields: ['title', 'description'], pageSize: 20 });

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

  // Format tanggal "Jul 14, 2026" seperti video (List/Kanban) — bukan ISO mentah.
  function formatDate(value: string): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div>
      <TasksPageHeader
        subtitle={`Total ${table.totalCount} task${table.totalCount === 1 ? '' : 's'}`}
        onAddTask={permissions.canCreate ? openCreateModal : undefined}
        canCreate={permissions.canCreate}
      />

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <TaskFilterBar
          className="border-b border-gray-200 p-4"
          search={table.search}
          onSearchChange={table.setSearch}
          statuses={opts?.statuses || []}
          priorities={opts?.priorities || []}
          assignees={opts?.assignees || []}
          filterStatus={filterStatus}
          filterPriority={filterPriority}
          filterAssignee={filterAssignee}
          onApply={applyFilters}
          onReset={resetFilters}
        />

        {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <SortableHeader label="Title" active={table.sortKey === 'title'} dir={table.sortDir} onClick={() => table.toggleSort('title')} />
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Assignee</th>
                <SortableHeader
                  label="Due Date"
                  active={table.sortKey === 'due_date'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('due_date')}
                />
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    {t('common_loading')}
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    Belum ada task.
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && table.paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    Tidak ada task yang cocok dengan pencarian/filter.
                  </td>
                </tr>
              )}
              {!loading &&
                table.paged.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-medium text-gray-900">{row.title}</td>
                    <td className="px-4 py-2 text-gray-500">{row.project_id ? label(opts?.projects, row.project_id) : '-'}</td>
                    <td className="px-4 py-2">
                      <Badge label={label(opts?.priorities, row.priority_id)} tone="neutral" />
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        label={label(opts?.statuses, row.status_id)}
                        color={opts?.statuses.find((s) => s.value === row.status_id)?.colorCode}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-500">{label(opts?.assignees, row.assigned_to)}</td>
                    <td className="px-4 py-2 text-gray-500">{formatDate(row.due_date)}</td>
                    <td className="px-4 py-2">
                      {canManage(row) && (
                        <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                          Detail
                        </button>
                      )}
                      {canDelete(row) && (
                        <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={table.page}
          totalPages={table.totalPages}
          totalCount={table.totalCount}
          pageSize={table.pageSize}
          onPageChange={table.setPage}
        />
      </div>

      {modalOpen && editingId && (
        <TaskDetailModal
          taskId={editingId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          permissions={{ canEdit: permissions.canEdit, canDelete: permissions.canDelete }}
          onClose={() => setModalOpen(false)}
          onChanged={silentReload}
        />
      )}

      {modalOpen && !editingId && opts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Tambah Task</h2>
            </div>
            {/* Bugfix (Fase 14): tombol aksi (Batal/Simpan) dipindah ke footer `shrink-0` di luar
                area scroll — sebelumnya ikut di dalam `overflow-y-auto`, jadi tombolnya ikut
                ter-scroll ke bawah dan hilang dari layar kalau field form-nya banyak/panjang. */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Judul *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Contoh: Perbaiki bug login di halaman utama"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
                {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Deskripsi</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Jelaskan detail tugas ini, langkah pengerjaan, atau referensi yang dibutuhkan..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Client *</label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, client_id: e.target.value, project_id: '' }))
                    }
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  >
                    <option value="">-- Pilih Client --</option>
                    {opts.clients.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.client_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.client_id}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Project *</label>
                  <select
                    required
                    disabled={!form.client_id}
                    value={form.project_id}
                    onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">{form.client_id ? '-- Pilih Project --' : '-- Pilih Client dahulu --'}</option>
                    {/* Bugfix (permintaan user): Project sekarang terfilter berdasarkan Client yang
                        dipilih di atas (lewat tautan Project Terkait di Master Client), bukan
                        menampilkan semua Project independen seperti sebelumnya. */}
                    {projectOptionsForTask.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.project_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.project_id}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Priority *</label>
                  <select
                    value={form.priority_id}
                    onChange={(e) => setForm((f) => ({ ...f, priority_id: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Task Type *</label>
                  <select
                    value={form.task_type_id}
                    onChange={(e) => setForm((f) => ({ ...f, task_type_id: e.target.value, related_task_id: '' }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
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
              </div>

              {showRelatedTask && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Task Terkait *</label>
                  <select
                    value={form.related_task_id}
                    onChange={(e) => setForm((f) => ({ ...f, related_task_id: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
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

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Assignee</label>
                {opts.canAssignOthers ? (
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  >
                    <option value="">-- Diri sendiri --</option>
                    {opts.assignees.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    Diri sendiri (Anda tidak punya hak menugaskan ke user lain)
                  </p>
                )}
                {opts.canAssignOthers && form.assigned_to !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, assigned_to: currentUserId }))}
                    className="mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Tugaskan ke saya
                  </button>
                )}
                {fieldErrors.assigned_to && <p className="mt-1 text-xs text-red-600">{fieldErrors.assigned_to}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="datetime-local"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Due Date</label>
                  <input
                    type="datetime-local"
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Est. Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="e.g., 8"
                    value={form.estimated_hours}
                    onChange={(e) => setForm((f) => ({ ...f, estimated_hours: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  />
                  {fieldErrors.estimated_hours && <p className="mt-1 text-xs text-red-600">{fieldErrors.estimated_hours}</p>}
                </div>
              </div>
            </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
