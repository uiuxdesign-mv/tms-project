'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { formatDuration } from '@/components/time-tracking-controls';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { Badge } from '@/components/badge';
import TaskComments from '@/components/task-comments';
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

export default function TaskDetailModal({
  taskId,
  currentUserId,
  isAdmin,
  permissions,
  onClose,
  onChanged,
}: {
  taskId: string;
  currentUserId: string;
  isAdmin: boolean;
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
  // Bugfix (permintaan user, fitur Leader Role): disamakan dengan canManageTask server yang
  // DIPERSEMPIT — HANYA Admin atau task yang assignee-nya dirinya sendiri. Pemimpin & Manager
  // (canAssignOthers) tetap bisa MEMBUKA modal ini untuk task user lain (lihat kanban-board.tsx/
  // tasks-table.tsx, tombol buka detail sudah tidak lagi digerbang canManage), tapi begitu masuk
  // sini semua field/aksi otomatis terkunci view-only karena canManage=false.
  const canManage = permissions.canEdit && !!task && (isAdmin || task.assigned_to === currentUserId);

  // Bugfix (permintaan user): detail Task (Title/Description/Project/Client/Priority/Task Type/
  // Assignee/tanggal) cuma boleh diedit bebas selama status masih To Do (default) — begitu task
  // mulai berjalan, perubahan wajib lewat tombol aksi Time Tracking (Start/Pause/Stop/Back/Done)
  // atau Cancel Task supaya business rule & History Log tetap konsisten, bukan lewat edit form
  // bebas. Field Status DIKECUALIKAN dari kunci ini (tetap pakai `canManage` seperti semula) —
  // form ini satu-satunya cara resmi memindahkan status MUNDUR (mis. In Review balik ke In
  // Progress kalau salah proses, lihat komentar handleDrop di kanban-board.tsx), jadi tetap harus
  // bisa diedit manual di sini, tervalidasi seperti biasa oleh Rule A/B di server.
  const isDefaultStatus = status?.isDefault ?? false;
  const canEditFields = canManage && isDefaultStatus;

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
        body: JSON.stringify(form),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else toast.error(json.error || t('toast_save_task_failed'));
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

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const startBtn = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700`;
  const pauseBtn = `${btnBase} border border-amber-400 text-amber-600 hover:bg-amber-50`;
  const stopBtn = `${btnBase} border border-red-300 text-red-600 hover:bg-red-50`;
  const backBtn = `${btnBase} border border-gray-300 text-gray-900 hover:bg-gray-100`;
  const doneBtn = `${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`;

  const selectedTaskType = opts?.taskTypes.find((tt) => tt.value === form?.task_type_id);
  const showRelatedTask = !!selectedTaskType?.requiresRelatedTask;

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
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
              {/* Kolom kiri: Time Tracking */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                {timeUnavailable ? (
                  <p className="text-sm text-gray-500">{t('td_tt_not_configured')}</p>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Time Tracking</h3>
                      {!status?.isFinal && timeState && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            timeState.state === 'running'
                              ? 'bg-emerald-50 text-emerald-700'
                              : timeState.state === 'paused'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {timeState.state === 'running'
                            ? t('td_tt_state_running')
                            : timeState.state === 'paused'
                            ? t('td_tt_state_paused')
                            : t('td_tt_state_not_started')}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('td_current_session')}</p>
                        <p className="tabular-nums text-base font-semibold text-gray-900">{formatDuration(currentSessionSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('tt_work_time')}</p>
                        <p className="tabular-nums text-base font-semibold text-gray-900">{formatDuration(workTimeSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('tt_review_time')}</p>
                        <p className="tabular-nums text-base font-semibold text-amber-600">{formatDuration(reviewTimeSeconds)}</p>
                      </div>
                    </div>

                    {canManage && timeState && !status?.isFinal && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {status?.isReview ? (
                          <>
                            <button disabled={busy} onClick={() => runTimeAction('back')} className={backBtn}>
                              {t('tt_btn_back')}
                            </button>
                            <button disabled={busy} onClick={() => runTimeAction('done')} className={doneBtn}>
                              {t('tt_btn_done')}
                            </button>
                          </>
                        ) : (
                          <>
                            {timeState.state === 'idle' && (
                              <>
                                <button disabled={busy} onClick={() => runTimeAction('start')} className={startBtn}>
                                  ▶ {t('tt_btn_start')}
                                </button>
                                {/* Bugfix (Fase 19, spec §2 "Kondisi Awal"): tombol Stop tetap
                                    DITAMPILKAN (dalam kondisi disabled) saat status To Do —
                                    sebelumnya disembunyikan total. Pause memang sengaja tidak
                                    ditampilkan sama sekali di kondisi ini, sesuai spesifikasi. */}
                                <button disabled className={stopBtn}>
                                  {t('tt_btn_stop')}
                                </button>
                              </>
                            )}
                            {timeState.state === 'running' && (
                              <>
                                <button disabled={busy} onClick={() => runTimeAction('pause')} className={pauseBtn}>
                                  {t('tt_btn_pause')}
                                </button>
                                <button disabled={busy} onClick={() => runTimeAction('stop')} className={stopBtn}>
                                  {t('tt_btn_stop')}
                                </button>
                              </>
                            )}
                            {timeState.state === 'paused' && (
                              <>
                                <button disabled={busy} onClick={() => runTimeAction('resume')} className={startBtn}>
                                  ▶ {t('tt_btn_start')}
                                </button>
                                <button disabled={busy} onClick={() => runTimeAction('stop')} className={stopBtn}>
                                  {t('tt_btn_stop')}
                                </button>
                              </>
                            )}
                          </>
                        )}
                        <button
                          disabled={busy}
                          onClick={handleCancelTask}
                          className={`${btnBase} ml-auto bg-red-600 text-white hover:bg-red-700`}
                        >
                          ✕ {t('td_cancel_task_btn')}
                        </button>
                      </div>
                    )}

                    <div className="mt-4 border-t border-gray-200 pt-3">
                      <div className="flex gap-4 border-b border-gray-200 text-sm">
                        <button
                          onClick={() => setActiveTab('work')}
                          className={`-mb-px border-b-2 pb-2 font-medium ${
                            activeTab === 'work' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'
                          }`}
                        >
                          {t('td_work_session_label')} ({workIntervals.length})
                        </button>
                        <button
                          onClick={() => setActiveTab('review')}
                          className={`-mb-px border-b-2 pb-2 font-medium ${
                            activeTab === 'review' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'
                          }`}
                        >
                          {t('td_review_session_label')} ({reviewIntervals.length})
                        </button>
                      </div>
                      <div className="mt-2 max-h-48 overflow-y-auto">
                        {(activeTab === 'work' ? workIntervals : reviewIntervals).length === 0 && (
                          <p className="py-3 text-center text-xs text-gray-400">{t('td_no_time_recorded')}</p>
                        )}
                        {(activeTab === 'work' ? workIntervals : reviewIntervals).length > 0 && (
                          <table className="w-full text-left text-xs">
                            <thead className="text-[10px] uppercase text-gray-400">
                              <tr>
                                <th className="pb-1 pr-2 font-medium">{t('td_col_start_resume')}</th>
                                <th className="pb-1 pr-2 font-medium">{activeTab === 'review' ? t('td_col_back_done') : t('td_col_pause_stop')}</th>
                                <th className="pb-1 font-medium">{t('td_col_duration')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(activeTab === 'work' ? workIntervals : reviewIntervals).map((iv, i) => {
                                // Bugfix (Fase 19, spec §6): label + warna Action/Activity meniru tabel warna aplikasi
                                // lama — Start=Blue, Resume=Green, Pause=Orange, Stop=Red. Sesi review cuma bisa
                                // ditutup lewat tombol Back atau Done (tidak ada Pause/Stop di tahap review), jadi
                                // penutupan sesi review dilabeli "Done" + hijau, bukan "Stop" + merah, konsisten
                                // dengan warna "Review Done = Green" di spec (event mentahnya tetap sama-sama `stop`,
                                // yang membedakan cuma konteks tab-nya).
                                const openLabel = iv.openedBy === 'start' ? t('tt_btn_start') : t('tt_btn_resume');
                                const openColor = iv.openedBy === 'start' ? 'text-blue-600' : 'text-emerald-600';
                                const closeLabel =
                                  iv.closedBy === null
                                    ? t('td_tt_state_running')
                                    : activeTab === 'review'
                                    ? t('tt_btn_done')
                                    : iv.closedBy === 'pause'
                                    ? t('tt_btn_pause')
                                    : t('tt_btn_stop');
                                const closeColor =
                                  iv.closedBy === null
                                    ? 'text-gray-400'
                                    : activeTab === 'review'
                                      ? 'text-emerald-600'
                                      : iv.closedBy === 'pause'
                                        ? 'text-amber-600'
                                        : 'text-red-600';
                                return (
                                  <tr key={i} className="align-top">
                                    <td className="py-1 pr-2">
                                      <div className={`font-medium ${openColor}`}>{openLabel}</div>
                                      <div className="text-gray-500">{formatLogTimestamp(iv.startAt)}</div>
                                      <div className="text-[10px] text-gray-400">{resolveActorName(iv.startedByUserId)}</div>
                                    </td>
                                    <td className="py-1 pr-2">
                                      <div className={`font-medium ${closeColor}`}>{closeLabel}</div>
                                      <div className="text-gray-500">{iv.endAt ? formatLogTimestamp(iv.endAt) : '-'}</div>
                                      {iv.endAt && <div className="text-[10px] text-gray-400">{resolveActorName(iv.endedByUserId)}</div>}
                                    </td>
                                    <td className="py-1 tabular-nums text-gray-700">
                                      {iv.endAt ? formatDuration(iv.seconds) : formatDuration(currentSessionSeconds)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Kolom kanan: form + komentar */}
              <div>
                {/* Bugfix (permintaan user, fitur Leader Role): notice terpisah untuk task yang
                    MEMANG cuma boleh dilihat (Pemimpin/Manager membuka task user lain) — beda
                    dari notice "terkunci sementara karena status berjalan" di bawah, yang cuma
                    berlaku untuk task milik sendiri. */}
                {!canManage && (
                  <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {t('td_view_only_notice')}
                  </div>
                )}
                {/* Bugfix (permintaan user, item detail tasking): blok info Pemberi Tugas/
                    Ditugaskan Kepada — hanya tampil kalau task ini benar-benar hasil PENUNJUKAN
                    TUGAS (assigned_by terisi DAN beda dari assigned_to). Cek "beda dari
                    assigned_to" ini SENGAJA ditambahkan karena data lama (sebelum perbaikan ini)
                    selalu mengisi assigned_by = pembuat task, walau task itu self-assigned — tanpa
                    cek ini, task lama yang dibuat untuk diri sendiri akan salah menampilkan blok
                    ini juga. jangan lupa i18n: label lewat t('td_assigned_by_label') dst. */}
                {task.assigned_by && task.assigned_by !== task.assigned_to && (
                  <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                    <p className="mb-1 font-semibold">{t('td_assignment_info_title')}</p>
                    <p>
                      {t('td_assigned_by_label')}: <span className="font-medium">{task.assigned_by_name || '-'}</span>
                    </p>
                    <p>
                      {t('td_assigned_to_label')}: <span className="font-medium">{label(opts.assignees, task.assigned_to)}</span>
                    </p>
                  </div>
                )}
                {/* Bugfix (Fase 14): id di sini dipakai tombol "Save changes" di footer bawah
                    (di luar area scroll) lewat atribut `form=` — supaya tombolnya tidak ikut
                    hilang ke-scroll padahal secara DOM sudah dipindah keluar dari <form> ini. */}
                {canManage && !isDefaultStatus && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {t('td_locked_notice')}
                  </div>
                )}
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_project')}</label>
                      <select
                        value={form.project_id}
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, project_id: e.target.value } : f))}
                        className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="">{t('td_option_none')}</option>
                        {/* Fase 12: Project & Client independen (sesuai video) — Project master
                            data tidak lagi punya field Client, jadi daftar Project TIDAK difilter
                            oleh Client yang dipilih di sini. */}
                        {opts.projects.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_client')}</label>
                      <select
                        value={form.client_id}
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, client_id: e.target.value } : f))}
                        className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="">{t('td_option_none')}</option>
                        {opts.clients.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_priority')}</label>
                      <select
                        value={form.priority_id}
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, priority_id: e.target.value } : f))}
                        className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, task_type_id: e.target.value, related_task_id: '' } : f))}
                        className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, related_task_id: e.target.value } : f))}
                        className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                      {fieldErrors.related_task_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.related_task_id}</p>}
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_assignee')}</label>
                    {opts.canAssignOthers ? (
                      <select
                        value={form.assigned_to}
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, assigned_to: e.target.value } : f))}
                        className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                    {fieldErrors.assigned_to && <p className="mt-1 text-xs text-red-600">{fieldErrors.assigned_to}</p>}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_start_date')}</label>
                      <input
                        type="datetime-local"
                        value={form.start_date}
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, start_date: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('td_field_due_date')}</label>
                      <input
                        type="datetime-local"
                        value={form.due_date}
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, due_date: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                        disabled={!canEditFields}
                        onChange={(e) => setForm((f) => (f ? { ...f, estimated_hours: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      />
                      {fieldErrors.estimated_hours && <p className="mt-1 text-xs text-red-600">{fieldErrors.estimated_hours}</p>}
                    </div>
                  </div>
                </form>

                <TaskComments
                  taskId={taskId}
                  currentUserId={currentUserId}
                  canDeleteAny={permissions.canDelete && canManage}
                  readOnly={!canManage}
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
