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
import { TasksPageHeader, TasksViewSwitcher } from '@/components/tasks-view-header';
import TaskDetailModal from '@/components/task-detail-modal';
import TaskCreateModal from '@/components/task-create-modal';
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

  // Perbaikan (permintaan user Round 6, poin 1): "Tambah Task" (createOpen) & "Detail/Edit Task"
  // (editingId) sekarang 2 flag independen, masing-masing me-mount modalnya sendiri
  // (TaskCreateModal / TaskDetailModal) — sebelumnya keduanya digabung lewat 1 flag `modalOpen` +
  // `editingId===null` untuk membedakan create vs edit, tidak lagi diperlukan sejak form Tambah
  // Task diekstrak jadi komponen terpisah.
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
  usePolling(silentReload, 20_000, !createOpen && !editingId);

  // Perbaikan (permintaan user Round 6, poin 1): dulu Kanban & Calendar tidak punya form Tambah
  // Task sendiri, tombol "+ Add Task" di sana mengarah ke /tasks?new=1 supaya modal-nya kebuka DI
  // SINI (List) — akibatnya klik "+ Add Task" dari Kanban/Calendar selalu melempar user pindah
  // view ke List dulu, baru modal kebuka (bug yang dilaporkan user). Sekarang Kanban & Calendar
  // masing-masing sudah punya TaskCreateModal sendiri (in-place, tidak pindah view), jadi query
  // param `?new=1` ini praktis sudah tidak pernah dikirim lagi oleh keduanya — tapi tetap
  // dipertahankan sebagai deep-link fallback (mis. bookmark/link lama) yang masih membuka modal
  // Tambah Task di List seperti semula.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreateOpen(true);
      router.replace('/tasks');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Perbaikan (permintaan user Round 5, poin 3): klik notifikasi "penunjukan tugas" di bell header
  // (notification-bell.tsx) mengarah ke sini dengan ?task=<id> — langsung buka Task Detail
  // Modal-nya, tidak perlu user mencari sendiri di daftar. Modal fetch datanya sendiri lewat GET
  // /api/tasks/[id] (sama seperti openEditModal), jadi cukup set id-nya saja di sini.
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId) {
      setEditingId(taskId);
      router.replace('/tasks');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Detail (List) & klik kartu (Kanban) sama-sama membuka TaskDetailModal (Fase 10) — modal itu
  // fetch datanya sendiri lewat GET /api/tasks/[id], jadi di sini cukup set id-nya saja.
  function openEditModal(row: TaskRow) {
    setEditingId(row.id);
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
        onAddTask={permissions.canCreate ? () => setCreateOpen(true) : undefined}
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
          rightSlot={<TasksViewSwitcher />}
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

      {editingId && (
        <TaskDetailModal
          taskId={editingId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          permissions={{ canEdit: permissions.canEdit, canDelete: permissions.canDelete }}
          onClose={() => setEditingId(null)}
          onChanged={silentReload}
        />
      )}

      {createOpen && opts && (
        <TaskCreateModal
          opts={opts}
          currentUserId={currentUserId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load({ silent: true });
          }}
        />
      )}
    </div>
  );
}
