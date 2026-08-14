'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import type { TimeTrackingState } from '@/components/time-tracking-controls';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useTableControls } from '@/lib/hooks/use-table-controls';
import { usePolling } from '@/lib/hooks/use-polling';
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
  /** Flag izin server-embedded (GET /api/tasks, lihat src/lib/models/tasks.ts) — permintaan user,
   *  perbaikan Leader & Pemberi Tugas: sudah dihitung di server, tidak lagi dihitung ulang di sini. */
  can_manage_info?: boolean;
  can_edit_fields_now?: boolean;
  can_delete?: boolean;
  can_operate_time_tracking?: boolean;
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
      const tasksJson = await parseJsonSafe(tasksRes);
      const optsJson = await parseJsonSafe(optsRes);
      if (!tasksRes.ok || !tasksJson.data) throw new Error(tasksJson.error || t('toast_load_data_failed'));
      if (!optsRes.ok || !optsJson.data) throw new Error(optsJson.error || t('toast_load_options_failed'));
      setRows(tasksJson.data);
      setOpts(optsJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_load_data_failed'));
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const silentReload = useCallback(() => load({ silent: true }), [load]);

  // Perbaikan (permintaan user Round 5, poin 2 — "aksi di user A harus langsung terlihat di user
  // B tanpa refresh manual"): polling diam-diam setiap 20 detik (lihat use-polling.ts untuk
  // penjelasan lengkap kenapa polling, bukan WebSocket — tidak ada infrastruktur real-time di
  // aplikasi ini). Dimatikan otomatis (enabled=false) selagi modal Detail/Tambah Task terbuka,
  // supaya reload di belakang layar tidak mengganggu form yang sedang diisi user (mis. field
  // ke-reset diam-diam gara-gara `opts` berubah referensi).
  usePolling(silentReload, 20_000, !modalOpen);

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

  // Perbaikan (permintaan user Round 5, poin 3): klik notifikasi "penunjukan tugas" di bell header
  // (notification-bell.tsx) mengarah ke sini dengan ?task=<id> — langsung buka Task Detail
  // Modal-nya, tidak perlu user mencari sendiri di daftar. Modal fetch datanya sendiri lewat GET
  // /api/tasks/[id] (sama seperti openEditModal), jadi cukup set id-nya saja di sini.
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId) {
      setEditingId(taskId);
      setModalOpen(true);
      router.replace('/tasks');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectedTaskType = opts?.taskTypes.find((tt) => tt.value === form.task_type_id);
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
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else toast.error(json.error || t('toast_save_task_failed'));
        return;
      }
      setModalOpen(false);
      await load({ silent: true });
      toast.success(editingId ? t('toast_save_task_success') : t('toast_task_created'));
    } catch {
      toast.error(t('toast_network_error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: TaskRow) {
    const ok = await confirmDialog({ message: `${t('confirm_delete_task_prefix')} "${row.title}"?`, confirmLabel: t('action_delete'), danger: true });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/tasks/${row.id}`, { method: 'DELETE' });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        toast.error(json.error || t('toast_delete_data_failed'));
        return;
      }
      await load({ silent: true });
      toast.success(`${t('toast_task_deleted_prefix')} "${row.title}" ${t('toast_task_deleted_suffix')}`);
    } catch {
      toast.error(t('toast_network_error'));
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

  // Perbaikan (permintaan user, perbaikan Leader & Pemberi Tugas poin 1-3): flag izin dibaca
  // LANGSUNG dari yang sudah dihitung server (GET /api/tasks, lihat src/lib/models/tasks.ts),
  // tidak lagi dihitung ulang di sini — supaya selalu konsisten dengan task-detail-modal.tsx &
  // kanban-board.tsx. `canOpenAsManaged` dipakai untuk label tombol "Detail" (bisa berbuat
  // sesuatu — kelola info ATAU minimal operasikan status/Time Tracking) vs "Lihat" (murni
  // view-only, mis. Manager yang cuma boleh melihat task yang dia tugaskan).
  function canOpenAsManaged(row: TaskRow) {
    if (!permissions.canEdit) return false;
    return !!row.can_manage_info || !!row.can_operate_time_tracking;
  }
  function canDelete(row: TaskRow) {
    if (!permissions.canDelete) return false;
    return !!row.can_delete;
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
        subtitle={`${t('tasks_subtitle_total')} ${table.totalCount} ${table.totalCount === 1 ? t('tasks_word_singular') : t('tasks_word_plural')}`}
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
                <SortableHeader label={t('col_title')} active={table.sortKey === 'title'} dir={table.sortDir} onClick={() => table.toggleSort('title')} />
                <th className="px-4 py-2 font-medium">{t('col_project')}</th>
                <th className="px-4 py-2 font-medium">{t('col_priority')}</th>
                <th className="px-4 py-2 font-medium">{t('col_status')}</th>
                <th className="px-4 py-2 font-medium">{t('col_assignee')}</th>
                <SortableHeader
                  label={t('td_field_due_date')}
                  active={table.sortKey === 'due_date'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('due_date')}
                />
                <th className="px-4 py-2 font-medium">{t('col_actions')}</th>
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
                    {t('tasks_empty')}
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && table.paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    {t('tasks_no_match')}
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
                      {/* Bugfix (permintaan user, fitur Leader Role): tombol buka detail SEKARANG
                          selalu tampil untuk baris manapun yang muncul di tabel ini (baris yang
                          tampil sudah pasti boleh dilihat, sudah difilter server via canViewTask)
                          — sebelumnya cuma tampil kalau canManage(row), jadi Pemimpin/Manager
                          tidak punya cara membuka task orang lain yang cuma boleh dia lihat.
                          Labelnya berubah "Detail" (bisa diedit) vs "Lihat" (view-only). */}
                      <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                        {canOpenAsManaged(row) ? t('action_detail') : t('action_view')}
                      </button>
                      {canDelete(row) && (
                        <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                          {t('action_delete')}
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
              <h2 className="text-lg font-semibold text-gray-900">{t('tasks_add_modal_title')}</h2>
            </div>
            {/* Bugfix (Fase 14): tombol aksi (Batal/Simpan) dipindah ke footer `shrink-0` di luar
                area scroll — sebelumnya ikut di dalam `overflow-y-auto`, jadi tombolnya ikut
                ter-scroll ke bawah dan hilang dari layar kalau field form-nya banyak/panjang. */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('tf_title')}</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t('td_field_title_placeholder')}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
                {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_description')}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t('td_field_description_placeholder')}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('tf_client')}</label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, client_id: e.target.value, project_id: '' }))
                    }
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  >
                    <option value="">{t('tf_option_choose_client')}</option>
                    {opts.clients.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.client_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.client_id}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('tf_project')}</label>
                  <select
                    required
                    disabled={!form.client_id}
                    value={form.project_id}
                    onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">{form.client_id ? t('tf_option_choose_project') : t('tf_option_choose_client_first')}</option>
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_priority')}</label>
                  <select
                    value={form.priority_id}
                    onChange={(e) => setForm((f) => ({ ...f, priority_id: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  >
                    <option value="">{t('td_option_choose')}</option>
                    {opts.priorities.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.priority_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.priority_id}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_task_type')}</label>
                  <select
                    value={form.task_type_id}
                    onChange={(e) => setForm((f) => ({ ...f, task_type_id: e.target.value, related_task_id: '' }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  >
                    <option value="">{t('td_option_choose_task_type')}</option>
                    {opts.taskTypes.map((tt) => (
                      <option key={tt.value} value={tt.value}>
                        {tt.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.task_type_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.task_type_id}</p>}
                </div>
              </div>

              {showRelatedTask && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_related_task')}</label>
                  <select
                    value={form.related_task_id}
                    onChange={(e) => setForm((f) => ({ ...f, related_task_id: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  >
                    <option value="">{t('td_option_choose_task')}</option>
                    {opts.relatedTasks
                      .filter((rt) => rt.value !== editingId)
                      .map((rt) => (
                        <option key={rt.value} value={rt.value}>
                          {rt.label}
                        </option>
                      ))}
                  </select>
                  {fieldErrors.related_task_id && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.related_task_id}</p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_assignee')}</label>
                {opts.canAssignOthers ? (
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  >
                    <option value="">{t('td_option_self')}</option>
                    {opts.assignees.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    {t('tf_self_no_permission')}
                  </p>
                )}
                {opts.canAssignOthers && form.assigned_to !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, assigned_to: currentUserId }))}
                    className="mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {t('td_assign_to_me')}
                  </button>
                )}
                {fieldErrors.assigned_to && <p className="mt-1 text-xs text-red-600">{fieldErrors.assigned_to}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_start_date')}</label>
                  <input
                    type="datetime-local"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_due_date')}</label>
                  <input
                    type="datetime-local"
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_est_hours')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder={t('td_est_hours_placeholder')}
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
                {t('action_cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? t('common_saving') : t('action_save')}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
