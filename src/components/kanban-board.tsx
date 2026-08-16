'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { TimeTrackingControls, type TimeTrackingState } from '@/components/time-tracking-controls';
import { useToast } from '@/components/toast-provider';
import { Badge } from '@/components/badge';
import { TasksPageHeader, TasksViewSwitcher } from '@/components/tasks-view-header';
import TaskDetailModal from '@/components/task-detail-modal';
import TaskCreateModal, { type TaskCreateOptionsData } from '@/components/task-create-modal';
import TaskFilterBar from '@/components/task-filter-bar';
import { useLanguage } from '@/components/language-provider';
import { usePolling } from '@/lib/hooks/use-polling';
import { getViewCache } from '@/lib/hooks/view-cache';
import { primeAllTaskViewsCache, primeAllTaskViewsRowsOnly } from '@/lib/hooks/task-view-cache';

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
  /** Flag izin server-embedded (GET /api/tasks, lihat src/lib/models/tasks.ts) — permintaan user,
   *  perbaikan Leader & Pemberi Tugas. */
  can_manage_info?: boolean;
  can_operate_time_tracking?: boolean;
};

type Option = { value: string; label: string };
type StatusOption = Option & {
  isFinal: boolean;
  isDefault: boolean;
  isReview: boolean;
  workflowLevel: number | null;
  colorCode?: string | null;
};

// Perbaikan (permintaan user Round 6, poin 1): sekarang berbasis `TaskCreateOptionsData` (bukan
// lagi tipe lokal yang lebih sempit) supaya `opts` di sini bisa langsung dioper ke
// `TaskCreateModal` tanpa fetch/tipe terpisah — datanya memang sudah selalu dikirim lengkap oleh
// GET /api/tasks/options, cuma sebelumnya tidak semuanya ditipekan di sini karena belum dipakai.
// `statuses` di-override ke varian lokal yang punya `workflowLevel` (angka, hasil parse dari
// `workflow_level` string) khusus dipakai logika urutan kolom & aturan drag Kanban.
type OptionsData = Omit<TaskCreateOptionsData, 'statuses'> & { statuses: StatusOption[] };

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
  const { t } = useLanguage();
  // Perbaikan (permintaan user Round 7, poin 3): lihat catatan lengkap di tasks-table.tsx — render
  // pertama langsung pakai data cache antar-tab (lib/hooks/view-cache.ts) kalau ada, supaya pindah
  // tab dari List/Calendar ke Kanban tidak lagi kedip "Memuat...".
  const [rows, setRows] = useState<TaskRow[]>(() => getViewCache<TaskRow[]>('tasks:kanban:rows') || []);
  const [opts, setOpts] = useState<OptionsData | null>(() => getViewCache<OptionsData>('tasks:kanban:opts') || null);
  const [loading, setLoading] = useState(() => !getViewCache<TaskRow[]>('tasks:kanban:rows'));
  const [error, setError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  // Perbaikan (permintaan user Round 6, poin 1): "+ Add Task" sekarang membuka TaskCreateModal
  // LANGSUNG di sini (in-place) — sebelumnya arahkan ke /tasks?new=1 yang malah memindahkan view
  // ke List dulu (bug yang dilaporkan user).
  const [createOpen, setCreateOpen] = useState(false);

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

  // Bugfix (permintaan user, item loading-flicker): sama seperti task-detail-modal.tsx — `load()`
  // dipanggil ulang tiap kali habis drag & drop atau aksi di modal (`onChanged`), bukan cuma saat
  // papan Kanban pertama kali dibuka. Sebelumnya SETIAP pemanggilan mem-blank seluruh papan ke
  // "Memuat..." karena `loading` dipaksa true tanpa syarat, jadi kartu-kartu hilang sebentar tiap
  // kali user drag kartu — sekarang reload setelah aksi (`silent: true`) tidak lagi mem-blank
  // papan, data cuma di-refresh diam-diam di belakang layar begitu response datang.
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
      const nextOpts = {
        ...optsJson.data,
        statuses: optsJson.data.statuses.map((s: Record<string, unknown>) => ({
          ...s,
          workflowLevel: s.workflow_level !== undefined && s.workflow_level !== '' ? Number(s.workflow_level) : null,
        })),
      };
      setOpts(nextOpts);
      // Perbaikan (permintaan user poin 3 — "ini masih terjadi diawal"): isi cache List & Calendar
      // sekaligus dari data yang sama (raw `optsJson.data`, transformasi workflowLevel khusus
      // Kanban ditangani sendiri oleh primeAllTaskViewsCache) — lihat catatan lengkap di
      // task-view-cache.ts.
      primeAllTaskViewsCache(tasksJson.data, optsJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_load_data_failed'));
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Perbaikan (Round 7, poin 3): silent kalau render pertama sudah terisi dari cache — lihat
    // catatan lengkap di tasks-table.tsx.
    load({ silent: rows.length > 0 || opts !== null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const silentReload = useCallback(() => load({ silent: true }), [load]);

  // Perbaikan (permintaan user poin 2 — "aksi pada card kanban ... masih sering lama merespon,
  // bahkan sering error"): reload versi RINGAN khusus dipakai `onChanged` milik
  // <TimeTrackingControls> yang menempel langsung di kartu (Start/Pause/Resume/Stop). Aksi Time
  // Tracking TIDAK PERNAH mengubah opsi master data (Client/Project/Task Type/Priority/Status/
  // Assignee) — silentReload biasa di atas selalu ikut me-refetch /api/tasks/options juga (2 dari
  // 8 sheet-nya SELALU langsung ke Google Sheets API, lihat catatan di route-nya), padahal untuk
  // kasus ini datanya dijamin tidak berubah. Cukup /api/tasks saja (berisi status_id & timeTracking
  // task yang barusan diubah — yang sebenarnya dibutuhkan kartu untuk re-render). Modal Detail
  // (`onChanged={silentReload}` di <TaskDetailModal> di bawah) TETAP pakai versi lengkap — Save
  // (bisa reassign/pindah client-project) & aksi lain dari modal lebih aman disamakan seperti
  // semula. Kegagalan reload latar belakang ini sengaja TIDAK men-set `error` (yang akan mem-blank
  // SELURUH papan) — cukup dicoba lagi di reload berikutnya (polling 20 detik atau aksi berikutnya).
  const silentReloadTasksOnly = useCallback(async () => {
    try {
      const tasksRes = await apiFetch('/api/tasks');
      const tasksJson = await parseJsonSafe(tasksRes);
      if (!tasksRes.ok || !tasksJson.data) return;
      setRows(tasksJson.data);
      // Ikut segarkan cache rows List & Calendar juga (data rows-nya sama persis) — lihat
      // catatan di task-view-cache.ts. `opts` sengaja tidak disentuh di sini.
      primeAllTaskViewsRowsOnly(tasksJson.data);
    } catch {
      // Diam-diam — lihat catatan di atas.
    }
  }, []);

  // Perbaikan (permintaan user Round 5, poin 2): polling diam-diam, sama pola & alasannya dengan
  // tasks-table.tsx (lihat use-polling.ts) — dimatikan selagi kartu sedang di-drag atau modal
  // Detail terbuka, supaya papan tidak "melompat" di tengah interaksi user.
  usePolling(silentReload, 20_000, !detailTaskId && !dragTaskId && !createOpen);

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

  // Perbaikan (permintaan user, perbaikan Leader & Pemberi Tugas poin 1-3): drag & Time Tracking
  // di kartu Kanban sekarang dibolehkan oleh canOperateTimeTracking (flag can_operate_time_tracking
  // dari server) — mencakup Admin/Pemimpin/pemilik/Pemberi Tugas (via canManageTaskInfo) DITAMBAH
  // penerima delegasi (poin 3: tetap boleh ubah status/Time Tracking walau tidak boleh edit info).
  // Klik kartu untuk buka detail TETAP selalu boleh (lihat onClick di bawah, tidak digerbang ini).
  function canOperate(row: TaskRow) {
    if (!permissions.canEdit) return false;
    return !!row.can_operate_time_tracking;
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
    if (!canOperate(task)) return;

    const currentStatus = opts?.statuses.find((s) => s.value === task.status_id);

    // Validasi "persis satu tahap maju" dicek di client dulu (sama seperti Rule Kanban di server,
    // PATCH /api/tasks/[id]) SEBELUM memutuskan aksi Time Tracking mana yang dijalankan di bawah —
    // supaya drag yang melompat tahap tetap ditolak dengan pesan yang sama seperti sebelumnya,
    // bukan diam-diam "dikoreksi" jadi cuma maju satu tahap tanpa penjelasan.
    const oldLevel = currentStatus?.workflowLevel;
    const newLevel = targetStatus.workflowLevel;
    const bothLevelsSet = oldLevel !== null && oldLevel !== undefined && newLevel !== null && newLevel !== undefined;
    if (!bothLevelsSet || newLevel !== oldLevel + 1) {
      toast.error(t('toast_kanban_drag_invalid'));
      return;
    }

    // Perbaikan (permintaan user poin 3 — "card tidak langsung berpindah, delay lama"): begitu drop
    // dinyatakan valid, kartu dipindah ke kolom baru SEKARANG JUGA di state lokal (`rows`) —
    // sebelumnya kartu baru tampak pindah kolom setelah `load({silent:true})` di bawah selesai
    // (menunggu penuh round-trip POST/PATCH + reload berikutnya, jadi berasa lambat/macet padahal
    // servernya sendiri sudah merespons). `previousStatusId` disimpan untuk ROLLBACK kalau request
    // ternyata ditolak/gagal server — supaya tidak ada kartu yang "salah tempat" pada kegagalan.
    const previousStatusId = task.status_id;
    setRows((prev) => prev.map((r) => (r.id === taskId ? { ...r, status_id: targetStatus.value } : r)));

    function rollback() {
      setRows((prev) => prev.map((r) => (r.id === taskId ? { ...r, status_id: previousStatusId } : r)));
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
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        rollback();
        toast.error(json.fieldErrors?.status_id || json.error || t('toast_move_task_failed'));
        return;
      }
      // Kartu sudah tampak di kolom baru sejak optimistic update di atas — reload di sini cuma
      // menyinkronkan detail lain (state Time Tracking, durasi, dst) dengan data server yang
      // sebenarnya, BUKAN yang membuat kartu terlihat berpindah (itu sudah terjadi instan tadi).
      await load({ silent: true });
      toast.success(`${t('toast_task_moved_prefix')} "${targetStatus.label}".`);
    } catch {
      rollback();
      toast.error(t('toast_network_error'));
    }
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-400 shadow-card">{t('common_loading')}</div>;
  if (error) return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!opts) return null;

  const sortedStatuses = [...opts.statuses].sort((a, b) => {
    if (a.workflowLevel === null && b.workflowLevel === null) return a.label.localeCompare(b.label);
    if (a.workflowLevel === null) return 1;
    if (b.workflowLevel === null) return -1;
    return a.workflowLevel - b.workflowLevel;
  });

  return (
    // Perbaikan (permintaan user): papan Kanban dulu tumbuh bebas ke bawah mengikuti kolom
    // terpanjang, jadi SELURUH HALAMAN yang ikut memanjang & discroll. Sekarang root-nya dipatok
    // tingginya = sisa layar (100vh dikurangi topbar AppShell `h-16`=4rem, dan padding halaman
    // `<main>` di app-shell.tsx yang `p-4 sm:p-6` — makanya ada 2 varian, mobile & sm+). Efek
    // rantainya (lihat `min-h-0`/`flex-1` di elemen-elemen di bawah, pola "flexbox height-chain"
    // yang sama dipakai di Task Detail Modal): begitu wadah PALING LUAR ini dipatok, kolom yang
    // isinya kepanjangan TERPAKSA scroll sendiri di dalam kolomnya — bukan lagi mendorong seluruh
    // halaman. Sudah dites lewat preview (Playwright) sebelum diterapkan ke sini.
    <div className="flex h-[calc(100vh_-_4rem_-_2rem)] flex-col sm:h-[calc(100vh_-_4rem_-_3rem)]">
      <div className="shrink-0">
        <TasksPageHeader
          subtitle={t('tasks_kanban_subtitle')}
          onAddTask={permissions.canEdit ? () => setCreateOpen(true) : undefined}
          canCreate={permissions.canEdit}
        />
      </div>

      {/* Perbaikan (permintaan user Round 6, poin 2 & 3): search box, filter, DAN switcher tab
          List/Kanban/Calendar (rightSlot, mentok kanan) sekarang satu baris, digabung dalam SATU
          container bordered yang sama dengan papan Kanban di bawahnya (border-b sebagai pemisah)
          — sama persis pola yang sudah ada di view List, bukan 2 card terpisah seperti sebelumnya.
          `min-h-0 flex-1` (BARU): card ini sekarang mengisi SISA tinggi wadah luar (bukan tumbuh
          bebas), supaya baris kolom di dalamnya bisa dipatok juga. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-white shadow-card">
        <TaskFilterBar
          className="shrink-0 border-b border-gray-200 p-4"
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
          rightSlot={<TasksViewSwitcher />}
        />

        {/* Perbaikan (permintaan user, poin 2 & 3): baris kolom sekarang `min-h-0 flex-1` (mengisi
            sisa tinggi card, bukan tumbuh bebas) — `overflow-x-auto` DIPERTAHANKAN tapi sekarang
            cuma jaring pengaman kalau status-nya sangat banyak (lihat `min-w-[15rem]` di tiap
            kolom di bawah), BUKAN mekanisme utama lagi seperti sebelumnya. Perhitungan
            `minWidth: jumlah kolom × 17.5rem` yang dulu di sini SUDAH TIDAK DIPERLUKAN lagi —
            kolom sekarang `flex-1` (saling membagi rata lebar tersedia, "fill kiri-kanan" sesuai
            permintaan), bukan lebar tetap yang perlu dijumlah manual. */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4">
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
                // Perbaikan (permintaan user, redesign Kanban): kolom dulu lebar tetap
                // `w-[17.5rem]` (280px) + `shrink-0` sehingga papan selalu overflow ke samping
                // ("scroll satu halaman" secara horizontal). Sekarang `flex-1` supaya kolom saling
                // membagi rata lebar tersedia ("fill kiri-kanan"), `min-w-[15rem]` sebagai jaring
                // pengaman agar kolom tidak collapse terlalu sempit saat status sangat banyak, dan
                // `min-h-0` supaya rantai flexbox tinggi (lihat komentar di root wrapper) bisa
                // diteruskan ke area task list di bawah agar scroll-nya independen per kolom.
                className={`flex min-h-0 min-w-[15rem] flex-1 flex-col rounded-xl border transition-colors ${
                  isDropTarget ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: status.colorCode || '#94a3b8' }}
                    />
                    <h3 className="text-sm font-semibold text-gray-900">{status.label}</h3>
                  </div>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">{columnTasks.length}</span>
                </div>
                {/* Perbaikan: `min-h-0 flex-1 overflow-y-auto` di sini (dulu hanya `flex-1`, tanpa
                    overflow sendiri) adalah kunci permintaan #1 — setiap kolom status sekarang
                    scroll sendiri secara independen, bukan ikut men-scroll seluruh halaman/papan. */}
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {columnTasks.length === 0 && <p className="px-2 py-4 text-center text-xs text-gray-400">{t('kanban_no_tasks')}</p>}
                  {columnTasks.map((row) => {
                    // Fase 19: task yang statusnya sudah Final (Done/Cancelled) tidak boleh di-drag
                    // sama sekali — konsisten dengan tombol Time Tracking yang juga ikut terkunci
                    // di status final (spec §5.7: "seluruh action button ... tidak dapat digunakan
                    // kembali").
                    const manageable = canOperate(row) && !status.isFinal;
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
                        onDragStart={(e) => {
                          setDragTaskId(row.id);
                          // Perbaikan (permintaan user poin 3 — "ketika card saya geser, maka card
                          // itu nampak ikut tergeser kemana pun kursor bergerak selama di drag"):
                          // set drag image SECARA EKSPLISIT ke elemen kartu itu sendiri, dengan
                          // offset persis di titik kursor menekan kartu (bukan pojok kiri-atas) —
                          // sebelumnya mengandalkan default browser tanpa parameter eksplisit, yang
                          // konsistensinya tidak terjamin di semua kombinasi browser/OS (sebagian
                          // menampilkan ghost pudar/kecil, bukan tampilan kartu yang sebenarnya).
                          // `effectAllowed` juga diset supaya kursor menampilkan ikon "pindah" yang
                          // benar sepanjang drag berlangsung.
                          if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = 'move';
                            const target = e.currentTarget;
                            const rect = target.getBoundingClientRect();
                            e.dataTransfer.setDragImage(target, e.clientX - rect.left, e.clientY - rect.top);
                          }
                        }}
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
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[0.6875rem] font-medium text-white"
                            title={assigneeName}
                          >
                            {initialOf(assigneeName)}
                          </span>
                        </div>

                        {(row.due_date || row.estimated_hours) && (
                          <div className="mt-1.5 flex items-center justify-between text-xs">
                            <span className={overdue ? 'font-medium text-red-600' : 'text-gray-400'}>
                              {row.due_date ? `${t('kanban_due_prefix')} ${formatShortDate(row.due_date)}` : ''}
                            </span>
                            <span className="text-gray-400">
                              {row.estimated_hours ? `${t('kanban_est_prefix')} ${Number(row.estimated_hours).toFixed(2)} h` : ''}
                            </span>
                          </div>
                        )}

                        <div className="mt-1.5 border-t border-gray-100 pt-1.5">
                          <TimeTrackingControls
                            taskId={row.id}
                            timeTracking={row.timeTracking}
                            status={status}
                            canManage={manageable}
                            onChanged={silentReloadTasksOnly}
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
          onChanged={silentReload}
        />
      )}

      {createOpen && (
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
