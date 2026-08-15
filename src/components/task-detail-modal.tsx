'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { Badge } from '@/components/badge';
import TaskActivityFeed from '@/components/task-activity-feed';
import TaskTimeTrackingPanel from '@/components/task-time-tracking-panel';
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
  /** Terisi HANYA kalau task ini hasil penunjukan tugas (ditugaskan ke user lain, bukan
   *  self-assigned) — dipakai untuk menampilkan blok "Informasi Penugasan" di bawah. */
  assigned_by?: string;
  assigned_by_name?: string;
  due_date: string;
  start_date?: string;
  estimated_hours?: string;
  created_at?: string;
  updated_at?: string;
  /** Flag izin yang SUDAH dihitung di server (GET /api/tasks/[id]) — permintaan user, perbaikan
   *  Leader & Pemberi Tugas: client tidak lagi menghitung ulang aturan izin sendiri, cukup baca
   *  langsung dari sini supaya selalu konsisten dengan tasks-table.tsx & kanban-board.tsx (lihat
   *  src/lib/models/tasks.ts untuk aturan lengkapnya). */
  can_manage_info?: boolean;
  can_edit_fields_now?: boolean;
  can_delete?: boolean;
  can_operate_time_tracking?: boolean;
};

type Option = { value: string; label: string };
type ProjectOption = Option & { clientId: string };
type TaskTypeOption = Option & { requiresRelatedTask: boolean };
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
  projects: ProjectOption[];
  taskTypes: TaskTypeOption[];
  priorities: Option[];
  statuses: StatusOption[];
  assignees: Option[];
  relatedTasks: Option[];
};

type TimeAction = 'start' | 'pause' | 'resume' | 'stop';
type TimeLogEvent = { id: string; session_no: string; action: TimeAction; is_review: string; occurred_at: string; user_id?: string };
type DerivedState = {
  state: 'idle' | 'running' | 'paused';
  currentSessionIsReview: boolean;
  closedWorkSeconds: number;
  closedReviewSeconds: number;
  liveSince: string | null;
};

// Bugfix (Fase 19, spec Kanban & Time Tracking §6): History Log sekarang menyertakan aksi
// pembuka (`openedBy`: start/resume) beserta user yang melakukannya (`startedByUserId`), dan user
// yang menutup sesi (`endedByUserId`) — sebelumnya cuma timestamp+durasi, tidak ada info aksi/user
// sama sekali walau datanya (`user_id`) sudah tersedia dari server sejak awal.
type SessionInterval = {
  startAt: string;
  endAt: string | null;
  seconds: number;
  openedBy: 'start' | 'resume';
  closedBy: 'pause' | 'stop' | null;
  startedByUserId?: string;
  endedByUserId?: string;
};

/** Pecah event log jadi interval Work/Review terpisah — tiap baris di tabel Work Session/Review
 *  Session (video) adalah SATU interval start/resume -> pause/stop berikutnya, BUKAN 1 baris per
 *  session_no penuh (satu session_no bisa berisi beberapa interval kalau di-pause lalu di-resume). */
function deriveIntervals(events: TimeLogEvent[]): { work: SessionInterval[]; review: SessionInterval[] } {
  const work: SessionInterval[] = [];
  const review: SessionInterval[] = [];
  let open: { startAt: string; isReview: boolean; openedBy: 'start' | 'resume'; userId?: string } | null = null;

  for (const ev of events) {
    if (ev.action === 'start' || ev.action === 'resume') {
      open = { startAt: ev.occurred_at, isReview: ev.is_review === 'Ya', openedBy: ev.action, userId: ev.user_id };
    } else if ((ev.action === 'pause' || ev.action === 'stop') && open) {
      const seconds = Math.max(0, Math.round((new Date(ev.occurred_at).getTime() - new Date(open.startAt).getTime()) / 1000));
      const interval: SessionInterval = {
        startAt: open.startAt,
        endAt: ev.occurred_at,
        seconds,
        openedBy: open.openedBy,
        closedBy: ev.action,
        startedByUserId: open.userId,
        endedByUserId: ev.user_id,
      };
      (open.isReview ? review : work).push(interval);
      open = null;
    }
  }
  if (open) {
    const cur = open;
    const interval: SessionInterval = {
      startAt: cur.startAt,
      endAt: null,
      seconds: 0,
      openedBy: cur.openedBy,
      closedBy: null,
      startedByUserId: cur.userId,
    };
    (cur.isReview ? review : work).push(interval);
  }
  // Terbaru di atas, seperti video.
  work.reverse();
  review.reverse();
  return { work, review };
}

function formatLogTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Redesign Modal Task Detail Round 10 lanjutan (layout total ala Saran 4 — permintaan user):
// section "Fields" ditata jadi baris ringkas (ikon + label + kontrol), bukan lagi label-di-atas-
// input bertumpuk seperti sebelumnya. Kontrol form (select/input) di dalam tiap baris TETAP
// persis sama (value/onChange/disabled/opsi) — cuma pembungkus visualnya yang berubah, supaya
// tidak ada satu pun fungsi form yang hilang.
const FIELD_ICON_PATHS = {
  folder:
    'M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776',
  building:
    'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  flag: 'M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5',
  tag: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z',
  link: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
  user: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  calendar:
    'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
} as const;

function FieldRowIcon({ d }: { d: string }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function FieldRow({
  icon,
  label,
  children,
  error,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <span className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center text-gray-400">{icon}</span>
      <span className="mt-2.5 w-32 shrink-0 text-sm text-gray-500">{label}</span>
      <div className="min-w-0 flex-1">
        {children}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export default function TaskDetailModal({
  taskId,
  currentUserId,
  permissions,
  onClose,
  onChanged,
}: {
  taskId: string;
  currentUserId: string;
  /** Sudah tidak dipakai langsung di sini (aturan izin sekarang dibaca dari flag server-embedded
   *  task.can_manage_info dkk, lihat catatan di atas) — tetap diterima sebagai prop opsional
   *  supaya pemanggil lama (tasks-table.tsx/kanban-board.tsx) tidak perlu diubah semua sekaligus. */
  isAdmin?: boolean;
  permissions: { canEdit: boolean; canDelete: boolean };
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { t } = useLanguage();
  const confirmDialog = useConfirm();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<TaskRow | null>(null);
  const [opts, setOpts] = useState<OptionsData | null>(null);
  const [timeState, setTimeState] = useState<DerivedState | null>(null);
  const [events, setEvents] = useState<TimeLogEvent[]>([]);
  const [timeUnavailable, setTimeUnavailable] = useState(false);

  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'work' | 'review'>('work');
  const [nowMs, setNowMs] = useState<number | null>(null);

  // Bugfix (permintaan user, item loading-flicker): `load()` dipanggil ulang setelah aksi Time
  // Tracking/Cancel Task (bukan cuma saat modal pertama dibuka) supaya data terbaru langsung
  // tampil — sebelumnya SETIAP pemanggilan (termasuk reload diam-diam setelah aksi) mem-blank
  // seluruh modal ke layar "Memuat..." karena `loading` dipaksa true tanpa syarat. Sekarang
  // parameter `silent` dipakai untuk reload setelah aksi: data & tampilan tetap ada di layar,
  // cuma di-refresh di belakang layar begitu response datang — TIDAK ada blank/flash lagi.
  // Blocking skeleton ("Memuat...") hanya muncul untuk load PERTAMA kali modal dibuka.
  const load = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [taskRes, optsRes, ttRes] = await Promise.all([
        apiFetch(`/api/tasks/${taskId}`),
        apiFetch('/api/tasks/options'),
        apiFetch(`/api/tasks/${taskId}/time-tracking`),
      ]);
      const taskJson = await parseJsonSafe(taskRes);
      const optsJson = await parseJsonSafe(optsRes);
      if (!taskRes.ok || !taskJson.data) throw new Error(taskJson.error || t('toast_load_task_failed'));
      if (!optsRes.ok || !optsJson.data) throw new Error(optsJson.error || t('toast_load_options_failed'));

      setTask(taskJson.data);
      setOpts({
        ...optsJson.data,
        statuses: optsJson.data.statuses.map((s: Record<string, unknown>) => ({
          ...s,
          workflowLevel: s.workflow_level !== undefined && s.workflow_level !== '' ? Number(s.workflow_level) : null,
        })),
      });
      setForm({
        title: taskJson.data.title || '',
        description: taskJson.data.description || '',
        client_id: taskJson.data.client_id || '',
        project_id: taskJson.data.project_id || '',
        task_type_id: taskJson.data.task_type_id || '',
        related_task_id: taskJson.data.related_task_id || '',
        priority_id: taskJson.data.priority_id || '',
        status_id: taskJson.data.status_id || '',
        assigned_to: taskJson.data.assigned_to || '',
        due_date: toDatetimeLocal(taskJson.data.due_date || ''),
        start_date: toDatetimeLocal(taskJson.data.start_date || ''),
        estimated_hours: taskJson.data.estimated_hours || '',
      });

      if (ttRes.ok) {
        const ttJson = await parseJsonSafe(ttRes);
        if (ttJson.data) {
          setTimeState(ttJson.data.state);
          setEvents(ttJson.data.events);
          setTimeUnavailable(false);
        } else {
          setTimeUnavailable(true);
        }
      } else {
        setTimeUnavailable(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_load_task_failed'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    if (timeState?.state !== 'running') return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timeState?.state]);

  function toDatetimeLocal(value: string): string {
    if (!value) return '';
    return value.includes('T') ? value.slice(0, 16) : `${value}T00:00`;
  }

  function label(list: Option[] | undefined, value: string) {
    return list?.find((o) => o.value === value)?.label || '-';
  }

  // Bugfix (Fase 19, spec §6): resolusi nama user yang melakukan sebuah aksi Time Tracking untuk
  // ditampilkan di History Log. `opts.assignees` bisa saja tidak lengkap untuk viewer non-privileged
  // (daftar assignee difilter), jadi ada fallback "You" untuk diri sendiri dan "Other User" kalau
  // ID-nya tidak ada di daftar yang kebetulan tersedia untuk user ini.
  function resolveActorName(userId: string | undefined): string {
    if (!userId) return '-';
    if (userId === currentUserId) return t('td_actor_you');
    const found = opts?.assignees.find((a) => a.value === userId);
    return found ? found.label : t('td_actor_other');
  }

  const status = opts?.statuses.find((s) => s.value === task?.status_id);

  // Perbaikan (permintaan user, perbaikan Leader & Pemberi Tugas poin 1-3): flag izin dibaca
  // LANGSUNG dari yang sudah dihitung server (GET /api/tasks/[id], lihat src/lib/models/tasks.ts)
  // — tidak lagi dihitung ulang di client, supaya selalu konsisten dengan tasks-table.tsx &
  // kanban-board.tsx.
  // - canManageInfo: boleh mengelola INFORMASI task (Admin/Pemimpin/pemilik/Pemberi Tugas).
  //   Penerima delegasi (ditugaskan orang lain ke dia) TIDAK termasuk di sini (poin 3).
  // - canOperateTT: boleh mengoperasikan status/Time Tracking — mencakup canManageInfo DITAMBAH
  //   penerima delegasi (poin 3: tetap boleh ubah status & Time Tracking walau tidak boleh edit
  //   info).
  const canManageInfo = permissions.canEdit && !!task && !!task.can_manage_info;
  const canOperateTT = permissions.canEdit && !!task && !!task.can_operate_time_tracking;

  // Detail Task (Title/Description/Project/Client/Priority/Task Type/Assignee/tanggal) cuma boleh
  // diedit bebas selama status masih To Do (default) DAN session-nya termasuk yang boleh mengelola
  // info (canManageInfo) — sudah termasuk aturan "Pemberi Tugas hanya selagi status awal" (poin 2)
  // lewat can_edit_fields_now yang dihitung di server (canEditTaskFieldsNow). (`status?.isDefault`
  // sebelumnya juga dipakai utk menampilkan banner "locked notice" terpisah — banner itu sudah
  // dihapus per permintaan user, redesign lanjutan, jadi variabelnya tidak dipakai lagi di sini.)
  const canEditFields = permissions.canEdit && !!task && !!task.can_edit_fields_now;

  const { work: workIntervals, review: reviewIntervals } = useMemo(() => deriveIntervals(events), [events]);

  const liveExtra =
    timeState?.state === 'running' && timeState.liveSince && nowMs
      ? Math.max(0, Math.floor((nowMs - new Date(timeState.liveSince).getTime()) / 1000))
      : 0;
  const currentSessionSeconds = liveExtra;
  const workTimeSeconds = (timeState?.closedWorkSeconds || 0) + (timeState?.currentSessionIsReview === false ? liveExtra : 0);
  const reviewTimeSeconds = (timeState?.closedReviewSeconds || 0) + (timeState?.currentSessionIsReview === true ? liveExtra : 0);

  async function runTimeAction(action: 'start' | 'pause' | 'resume' | 'stop' | 'back' | 'done') {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/time-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        toast.error(json.error || t('toast_tt_action_failed'));
        return;
      }
      await load({ silent: true });
      onChanged();
      const actionLabel: Record<typeof action, string> = {
        start: t('toast_tt_started'),
        pause: t('toast_tt_paused'),
        resume: t('toast_tt_resumed'),
        stop: t('toast_tt_stopped'),
        back: t('toast_tt_back'),
        done: t('toast_tt_done'),
      };
      toast.success(actionLabel[action]);
    } catch {
      toast.error(t('toast_network_error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelTask() {
    if (!opts) return;
    // Status "Cancel" diidentifikasi dari desain yang sudah ada di aturan workflow (lihat
    // PATCH /api/tasks/[id]): status final TANPA workflow_level dikecualikan dari aturan urutan
    // maju satu-tahap, persis supaya bisa dituju dari status manapun — itulah status setara
    // "Cancelled" di aplikasi lama.
    const cancelStatus = opts.statuses.find((s) => s.isFinal && s.workflowLevel === null);
    if (!cancelStatus) {
      toast.error(t('toast_no_cancel_status'));
      return;
    }
    const ok = await confirmDialog({
      message: `${t('confirm_cancel_task_prefix')} "${task?.title}"? ${t('confirm_cancel_task_suffix')} "${cancelStatus.label}".`,
      confirmLabel: t('td_cancel_task_btn'),
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      // Bugfix (Fase 19, spec Kanban & Time Tracking §7): sebelumnya di sini PATCH status_id
      // mentah — kalau ada sesi Time Tracking yang sedang berjalan/di-pause, sesi itu tidak pernah
      // resmi ditutup (Work/Review Time yang sudah lewat tidak ter-simpan, History Log tidak
      // mencatat kapan berhenti). Sekarang lewat aksi `cancel` di endpoint Time Tracking, yang
      // menutup sesi terbuka dulu (persis seperti Stop/Done) baru memindahkan status ke Cancelled.
      const res = await apiFetch(`/api/tasks/${taskId}/time-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        toast.error(json.error || t('toast_cancel_task_failed'));
        return;
      }
      await load({ silent: true });
      onChanged();
      toast.success(t('toast_cancel_task_success'));
    } catch {
      toast.error(t('toast_network_error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Perbaikan (permintaan user, item concurrency — cegah 2 user menimpa perubahan satu sama
        // lain tanpa sadar): sertakan updated_at yang dimuat modal ini terakhir kali — server
        // menolak dengan pesan jelas (409) kalau task ternyata sudah diubah user lain sejak saat
        // itu, alih-alih diam-diam menimpa perubahannya. Lihat OptimisticLockError di
        // src/lib/google/sheet-table.ts.
        body: JSON.stringify({ ...form, expected_updated_at: task?.updated_at || '' }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        if (json.conflict) {
          // Konflik: JANGAN timpa form yang sedang diisi user (biar tidak kehilangan draft-nya) —
          // cukup beri tahu jelas, dia bisa tutup & buka lagi modal ini untuk lihat versi terbaru.
          toast.error(json.error || t('toast_save_conflict'));
        } else if (json.fieldErrors) {
          setFieldErrors(json.fieldErrors);
        } else {
          toast.error(json.error || t('toast_save_task_failed'));
        }
        return;
      }
      onChanged();
      toast.success(t('toast_save_task_success'));
      onClose();
    } catch {
      toast.error(t('toast_network_error'));
    } finally {
      setSaving(false);
    }
  }

  const selectedTaskType = opts?.taskTypes.find((tt) => tt.value === form?.task_type_id);
  const showRelatedTask = !!selectedTaskType?.requiresRelatedTask;

  // Permintaan user (redesign lanjutan): ikon chevron-down (dari class global `.select-field`,
  // lihat globals.css) dihilangkan KHUSUS saat field sedang view-only/terkunci (!canEditFields) —
  // supaya select yang tidak bisa diklik tidak terlihat seperti dropdown interaktif. Saat field
  // BOLEH diedit, tampilannya tidak berubah sama sekali (tetap pakai `.select-field` + chevron).
  const selectFieldClass = canEditFields
    ? 'select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500'
    : 'focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-3 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-gray-900">{task?.title || t('td_task_fallback_title')}</h2>
            {/* Bugfix (permintaan user): badge Status dipindah ke sini, sejajar dengan judul —
                sebelumnya field Status read-only berdiri sendiri di dalam form. */}
            {status && <Badge label={status.label} color={status.colorCode} />}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900" aria-label={t('td_close')}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && <div className="p-8 text-center text-gray-400">{t('common_loading')}</div>}
        {error && <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {!loading && task && opts && form && (
          // Permintaan user (redesign lanjutan): modal secara keseluruhan TIDAK lagi scroll — yang
          // scroll cuma kolom kiri (Time Tracking/Judul/Deskripsi/Fields), kolom kanan (Activity)
          // punya scroll internalnya sendiri (lihat task-activity-feed.tsx) dan mengisi penuh
          // tinggi kolom. Dibatasi ke breakpoint lg supaya perilaku mobile (belum pernah diminta
          // berubah) tetap sama seperti sebelumnya (satu scroll container penuh).
          <div className="flex-1 overflow-y-auto p-5 lg:overflow-hidden">
            {/* Redesign Modal Task Detail Round 10 lanjutan (layout total ala Saran 4 —
                permintaan user): dari 320px-Time-Tracking + form lebar, sekarang 2 kolom sepadan —
                kiri notice+Time Tracking(ringkas)+Judul/Deskripsi+Fields, kanan Activity. */}
            <div className="grid grid-cols-1 gap-5 lg:h-full lg:grid-cols-2">
              {/* Kolom kiri — scroll sendiri di layar besar (lg:overflow-y-auto) */}
              <div className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                {/* Perbaikan (permintaan user, perbaikan Leader & Pemberi Tugas poin 1-3): TIGA
                    kemungkinan notice tergantung kombinasi canManageInfo/canOperateTT —
                    (a) murni view-only (tidak bisa apa-apa selain lihat & komentar),
                    (b) boleh mengerjakan (status/Time Tracking) tapi tidak boleh edit info
                        (penerima delegasi, poin 3), atau
                    (c) boleh kelola info tapi field-nya sedang terkunci karena status sudah
                        bukan status awal (notice ini ada di blok terpisah di bawah). */}
                {!canManageInfo && !canOperateTT && (
                  <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {t('td_view_only_notice')}
                  </div>
                )}
                {!canManageInfo && canOperateTT && (
                  <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                    {t('td_operate_only_notice')}
                  </div>
                )}
                {/* Permintaan user (redesign lanjutan): blok banner "Informasi Penugasan"
                    (Pemberi Tugas/Ditugaskan Kepada) dan banner "locked notice" DIHAPUS dari
                    posisi ini — informasi "Pemberi Tugas" TIDAK hilang, cuma dipindah jadi 1 baris
                    ringkas di section Fields, tepat di atas baris Assignee (lihat FieldRow
                    "Pemberi Tugas" di bawah). "Ditugaskan Kepada" tidak diduplikasi lagi di sini
                    karena sudah terwakili oleh baris Assignee itu sendiri. Teks penjelasan locked
                    notice sengaja tidak dipindahkan ke mana pun, sesuai permintaan eksplisit user. */}

                {/* Redesign Round 10 lanjutan ("Opsi 7" dari redesign-modal-round4-timetracking.md,
                    dengan penyesuaian permintaan user: dipindah ke ATAS Judul/Deskripsi, bukan di
                    footer). Seluruh logic Time Tracking (state machine tombol, tab Sesi Kerja/
                    Review, tabel riwayat, Batalkan Task) dipindah 1:1 ke komponen ini — lihat
                    src/components/task-time-tracking-panel.tsx. */}
                <TaskTimeTrackingPanel
                  timeUnavailable={timeUnavailable}
                  isFinalStatus={status?.isFinal ?? false}
                  isReviewStatus={status?.isReview ?? false}
                  timeState={timeState}
                  canOperateTT={canOperateTT}
                  canManageInfo={canManageInfo}
                  busy={busy}
                  currentSessionSeconds={currentSessionSeconds}
                  workTimeSeconds={workTimeSeconds}
                  reviewTimeSeconds={reviewTimeSeconds}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  workIntervals={workIntervals}
                  reviewIntervals={reviewIntervals}
                  resolveActorName={resolveActorName}
                  onAction={runTimeAction}
                  onCancelTask={handleCancelTask}
                />

                <form id="task-edit-form" onSubmit={handleSave} className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_title')}</label>
                    <input
                      value={form.title}
                      disabled={!canEditFields}
                      onChange={(e) => setForm((f) => (f ? { ...f, title: e.target.value } : f))}
                      placeholder={t('td_field_title_placeholder')}
                      className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_description')}</label>
                    <textarea
                      value={form.description}
                      disabled={!canEditFields}
                      onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                      placeholder={t('td_field_description_placeholder')}
                      rows={3}
                      className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>

                  {/* Redesign Round 10 lanjutan: section field ala mockup Saran 4 — tiap field jadi
                      1 baris ringkas (ikon + label + kontrol) menggantikan grid 2-kolom
                      label-di-atas-input. Kontrolnya (select/input) TETAP fungsi & handler yang
                      sama persis seperti sebelumnya, cuma pembungkusnya yang berubah. */}
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {t('td_fields_section_title')}
                    </p>
                    <div className="rounded-xl border border-gray-200 bg-white px-3">
                      {/* Baris Status murni tambahan visual (mencerminkan badge yang sudah ada di
                          judul modal) — TIDAK menggantikan atau mengubah cara Status diubah (tetap
                          lewat Time Tracking/Kanban/Cancel Task, bukan lewat form ini). */}
                      {status && (
                        <FieldRow
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <circle cx="12" cy="12" r="8.25" />
                            </svg>
                          }
                          label={t('col_status')}
                        >
                          <Badge label={status.label} color={status.colorCode} />
                        </FieldRow>
                      )}

                      <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.folder} />} label={t('td_field_project')}>
                        <select
                          value={form.project_id}
                          disabled={!canEditFields}
                          onChange={(e) => setForm((f) => (f ? { ...f, project_id: e.target.value } : f))}
                          className={selectFieldClass}
                        >
                          <option value="">{t('td_option_none')}</option>
                          {/* Fase 12: Project & Client independen (sesuai video) — Project master
                              data tidak lagi punya field Client, jadi daftar Project TIDAK
                              difilter oleh Client yang dipilih di sini. */}
                          {opts.projects.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </FieldRow>

                      <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.building} />} label={t('td_field_client')}>
                        <select
                          value={form.client_id}
                          disabled={!canEditFields}
                          onChange={(e) => setForm((f) => (f ? { ...f, client_id: e.target.value } : f))}
                          className={selectFieldClass}
                        >
                          <option value="">{t('td_option_none')}</option>
                          {opts.clients.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </FieldRow>

                      <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.flag} />} label={t('td_field_priority')} error={fieldErrors.priority_id}>
                        <select
                          value={form.priority_id}
                          disabled={!canEditFields}
                          onChange={(e) => setForm((f) => (f ? { ...f, priority_id: e.target.value } : f))}
                          className={selectFieldClass}
                        >
                          <option value="">{t('td_option_choose')}</option>
                          {opts.priorities.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </FieldRow>

                      <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.tag} />} label={t('td_field_task_type')} error={fieldErrors.task_type_id}>
                        <select
                          value={form.task_type_id}
                          disabled={!canEditFields}
                          onChange={(e) => setForm((f) => (f ? { ...f, task_type_id: e.target.value, related_task_id: '' } : f))}
                          className={selectFieldClass}
                        >
                          <option value="">{t('td_option_choose_task_type')}</option>
                          {opts.taskTypes.map((tt) => (
                            <option key={tt.value} value={tt.value}>
                              {tt.label}
                            </option>
                          ))}
                        </select>
                      </FieldRow>

                      {showRelatedTask && (
                        <FieldRow
                          icon={<FieldRowIcon d={FIELD_ICON_PATHS.link} />}
                          label={t('td_field_related_task')}
                          error={fieldErrors.related_task_id}
                        >
                          <select
                            value={form.related_task_id}
                            disabled={!canEditFields}
                            onChange={(e) => setForm((f) => (f ? { ...f, related_task_id: e.target.value } : f))}
                            className={selectFieldClass}
                          >
                            <option value="">{t('td_option_choose_task')}</option>
                            {opts.relatedTasks
                              .filter((rt) => rt.value !== taskId)
                              .map((rt) => (
                                <option key={rt.value} value={rt.value}>
                                  {rt.label}
                                </option>
                              ))}
                          </select>
                        </FieldRow>
                      )}

                      {/* Permintaan user (redesign lanjutan): baris "Pemberi Tugas" — sebelumnya
                          banner terpisah "Informasi Penugasan" di atas form, sekarang dipindah
                          jadi 1 baris ringkas di sini, TEPAT DI ATAS baris Assignee. Kondisi
                          tampil sama persis seperti banner sebelumnya (assigned_by terisi DAN
                          beda dari assigned_to — lihat catatan lama di git blame kalau perlu
                          konteks kenapa cek "beda dari assigned_to" ini penting untuk data lama). */}
                      {task.assigned_by && task.assigned_by !== task.assigned_to && (
                        <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.user} />} label={t('td_assigned_by_label')}>
                          {/* Permintaan user (redesign lanjutan): style disamakan dengan field
                              lain yang view-only/disabled (kotak border + bg-gray-50), bukan lagi
                              teks polos. */}
                          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                            {task.assigned_by_name || '-'}
                          </p>
                        </FieldRow>
                      )}

                      <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.user} />} label={t('td_field_assignee')} error={fieldErrors.assigned_to}>
                        {opts.canAssignOthers ? (
                          <select
                            value={form.assigned_to}
                            disabled={!canEditFields}
                            onChange={(e) => setForm((f) => (f ? { ...f, assigned_to: e.target.value } : f))}
                            className={selectFieldClass}
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
                            {label(opts.assignees, form.assigned_to)}
                          </p>
                        )}
                        {opts.canAssignOthers && canEditFields && form.assigned_to !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => setForm((f) => (f ? { ...f, assigned_to: currentUserId } : f))}
                            className="mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            {t('td_assign_to_me')}
                          </button>
                        )}
                      </FieldRow>

                      <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.calendar} />} label={t('td_field_start_date')}>
                        <input
                          type="datetime-local"
                          value={form.start_date}
                          disabled={!canEditFields}
                          onChange={(e) => setForm((f) => (f ? { ...f, start_date: e.target.value } : f))}
                          className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </FieldRow>

                      <FieldRow icon={<FieldRowIcon d={FIELD_ICON_PATHS.calendar} />} label={t('td_field_due_date')}>
                        <input
                          type="datetime-local"
                          value={form.due_date}
                          disabled={!canEditFields}
                          onChange={(e) => setForm((f) => (f ? { ...f, due_date: e.target.value } : f))}
                          className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </FieldRow>

                      <FieldRow
                        icon={<FieldRowIcon d={FIELD_ICON_PATHS.clock} />}
                        label={t('td_field_est_hours')}
                        error={fieldErrors.estimated_hours}
                      >
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          placeholder={t('td_est_hours_placeholder')}
                          value={form.estimated_hours}
                          disabled={!canEditFields}
                          onChange={(e) => setForm((f) => (f ? { ...f, estimated_hours: e.target.value } : f))}
                          className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </FieldRow>
                    </div>
                  </div>
                </form>
              </div>

              {/* Kolom kanan: Activity (Redesign Round 10, "Saran 4": Komentar + Riwayat Perubahan
                  digabung jadi satu Activity Feed dengan filter Semua/Komentar/Perubahan &
                  collapse aktivitas lama — menggantikan dua kartu terpisah <TaskComments>/
                  <TaskHistory>. Semua fitur asli kedua komponen itu tetap ada di dalam
                  TaskActivityFeed.) */}
              <div className="flex flex-col lg:min-h-0">
                <TaskActivityFeed
                  taskId={taskId}
                  currentUserId={currentUserId}
                  canDeleteAny={permissions.canDelete && canManageInfo}
                  // Perbaikan (permintaan user poin 2): menambahkan komentar sekarang cukup bisa
                  // MELIHAT task-nya (canAddComment=canViewTask di server) — modal ini hanya
                  // pernah dibuka untuk task yang lolos canViewTask, jadi selalu boleh berkomentar.
                  readOnly={false}
                />
              </div>
            </div>
          </div>
        )}

        {!loading && task && (
          <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-5 py-3 text-xs text-gray-400">
            <div>
              {task.created_at && <p>{t('td_created_label')}: {formatLogTimestamp(task.created_at)}</p>}
              {task.updated_at && <p>{t('td_updated_label')}: {formatLogTimestamp(task.updated_at)}</p>}
            </div>
            <div className="flex items-center gap-2">
              {/* Bugfix (permintaan user): tombol Save changes sekarang cuma tampil kalau field
                  form masih boleh diedit (status To Do) — sebelumnya tetap muncul walau semua
                  field sudah dikunci, karena awalnya dipakai juga untuk submit perubahan Status
                  manual. Field Status sudah dihapus total dari form (jadi badge read-only di
                  judul modal), jadi tidak ada lagi alasan tombol ini tetap tampil saat terkunci. */}
              {canEditFields && (
                <button
                  type="submit"
                  form="task-edit-form"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? t('common_saving') : t('form_save_changes')}
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('td_close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
