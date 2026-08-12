'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { formatDuration } from '@/components/time-tracking-controls';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
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
type TimeLogEvent = { id: string; session_no: string; action: TimeAction; is_review: string; occurred_at: string };
type DerivedState = {
  state: 'idle' | 'running' | 'paused';
  currentSessionIsReview: boolean;
  closedWorkSeconds: number;
  closedReviewSeconds: number;
  liveSince: string | null;
};

type SessionInterval = { startAt: string; endAt: string | null; seconds: number; closedBy: 'pause' | 'stop' | null };

/** Pecah event log jadi interval Work/Review terpisah — tiap baris di tabel Work Session/Review
 *  Session (video) adalah SATU interval start/resume -> pause/stop berikutnya, BUKAN 1 baris per
 *  session_no penuh (satu session_no bisa berisi beberapa interval kalau di-pause lalu di-resume). */
function deriveIntervals(events: TimeLogEvent[]): { work: SessionInterval[]; review: SessionInterval[] } {
  const work: SessionInterval[] = [];
  const review: SessionInterval[] = [];
  let open: { startAt: string; isReview: boolean } | null = null;

  for (const ev of events) {
    if (ev.action === 'start' || ev.action === 'resume') {
      open = { startAt: ev.occurred_at, isReview: ev.is_review === 'Ya' };
    } else if ((ev.action === 'pause' || ev.action === 'stop') && open) {
      const seconds = Math.max(0, Math.round((new Date(ev.occurred_at).getTime() - new Date(open.startAt).getTime()) / 1000));
      const interval: SessionInterval = { startAt: open.startAt, endAt: ev.occurred_at, seconds, closedBy: ev.action };
      (open.isReview ? review : work).push(interval);
      open = null;
    }
  }
  if (open) {
    const cur: { startAt: string; isReview: boolean } = open;
    const interval: SessionInterval = { startAt: cur.startAt, endAt: null, seconds: 0, closedBy: null };
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, optsRes, ttRes] = await Promise.all([
        apiFetch(`/api/tasks/${taskId}`),
        apiFetch('/api/tasks/options'),
        apiFetch(`/api/tasks/${taskId}/time-tracking`),
      ]);
      const taskJson = await taskRes.json();
      const optsJson = await optsRes.json();
      if (!taskRes.ok) throw new Error(taskJson.error || 'Gagal memuat task.');
      if (!optsRes.ok) throw new Error(optsJson.error || 'Gagal memuat opsi.');

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
        const ttJson = await ttRes.json();
        setTimeState(ttJson.data.state);
        setEvents(ttJson.data.events);
        setTimeUnavailable(false);
      } else {
        setTimeUnavailable(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat task.');
    } finally {
      setLoading(false);
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

  const status = opts?.statuses.find((s) => s.value === task?.status_id);
  const canManage =
    permissions.canEdit && !!task && (isAdmin || !!opts?.canAssignOthers || task.assigned_to === currentUserId);

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
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Gagal menjalankan aksi Time Tracking.');
        return;
      }
      await load();
      onChanged();
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
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
      toast.error('Tidak ada status "Cancelled" yang dikonfigurasi di Master Status.');
      return;
    }
    const ok = await confirmDialog({
      message: `Batalkan task "${task?.title}"? Status akan diubah ke "${cancelStatus.label}".`,
      confirmLabel: 'Batalkan Task',
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_id: cancelStatus.value }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.fieldErrors?.status_id || json.error || 'Gagal membatalkan task.');
        return;
      }
      await load();
      onChanged();
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
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
      const json = await res.json();
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else toast.error(json.error || 'Gagal menyimpan data.');
        return;
      }
      onChanged();
      onClose();
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
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

  const selectedTaskType = opts?.taskTypes.find((t) => t.value === form?.task_type_id);
  const showRelatedTask = !!selectedTaskType?.requiresRelatedTask;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{task?.title || 'Task'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900" aria-label="Tutup">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && <div className="p-8 text-center text-gray-400">Memuat...</div>}
        {error && <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {!loading && task && opts && form && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
              {/* Kolom kiri: Time Tracking */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                {timeUnavailable ? (
                  <p className="text-sm text-gray-500">Time Tracking belum dikonfigurasi di server ini.</p>
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
                          {timeState.state === 'running' ? 'Running' : timeState.state === 'paused' ? 'Paused' : 'Not started'}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Current Session</p>
                        <p className="tabular-nums text-base font-semibold text-gray-900">{formatDuration(currentSessionSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Work Time</p>
                        <p className="tabular-nums text-base font-semibold text-gray-900">{formatDuration(workTimeSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Review Time</p>
                        <p className="tabular-nums text-base font-semibold text-amber-600">{formatDuration(reviewTimeSeconds)}</p>
                      </div>
                    </div>

                    {canManage && timeState && !status?.isFinal && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {status?.isReview ? (
                          <>
                            <button disabled={busy} onClick={() => runTimeAction('back')} className={backBtn}>
                              Back
                            </button>
                            <button disabled={busy} onClick={() => runTimeAction('done')} className={doneBtn}>
                              Done
                            </button>
                          </>
                        ) : (
                          <>
                            {timeState.state === 'idle' && (
                              <button disabled={busy} onClick={() => runTimeAction('start')} className={startBtn}>
                                ▶ Start
                              </button>
                            )}
                            {timeState.state === 'running' && (
                              <>
                                <button disabled={busy} onClick={() => runTimeAction('pause')} className={pauseBtn}>
                                  Pause
                                </button>
                                <button disabled={busy} onClick={() => runTimeAction('stop')} className={stopBtn}>
                                  Stop
                                </button>
                              </>
                            )}
                            {timeState.state === 'paused' && (
                              <>
                                <button disabled={busy} onClick={() => runTimeAction('resume')} className={startBtn}>
                                  ▶ Start
                                </button>
                                <button disabled={busy} onClick={() => runTimeAction('stop')} className={stopBtn}>
                                  Stop
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
                          ✕ Cancel Task
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
                          Work Session ({workIntervals.length})
                        </button>
                        <button
                          onClick={() => setActiveTab('review')}
                          className={`-mb-px border-b-2 pb-2 font-medium ${
                            activeTab === 'review' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'
                          }`}
                        >
                          Review Session ({reviewIntervals.length})
                        </button>
                      </div>
                      <div className="mt-2 max-h-48 overflow-y-auto">
                        {(activeTab === 'work' ? workIntervals : reviewIntervals).length === 0 && (
                          <p className="py-3 text-center text-xs text-gray-400">No time recorded yet.</p>
                        )}
                        {(activeTab === 'work' ? workIntervals : reviewIntervals).length > 0 && (
                          <table className="w-full text-left text-xs">
                            <thead className="text-[10px] uppercase text-gray-400">
                              <tr>
                                <th className="pb-1 pr-2 font-medium">Start/Resume</th>
                                <th className="pb-1 pr-2 font-medium">Pause/Stop</th>
                                <th className="pb-1 font-medium">Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(activeTab === 'work' ? workIntervals : reviewIntervals).map((iv, i) => (
                                <tr key={i}>
                                  <td className="py-1 pr-2 font-medium text-emerald-600">{formatLogTimestamp(iv.startAt)}</td>
                                  <td className={`py-1 pr-2 font-medium ${iv.endAt ? 'text-red-600' : 'text-amber-600'}`}>
                                    {iv.endAt ? formatLogTimestamp(iv.endAt) : 'Running'}
                                  </td>
                                  <td className="py-1 tabular-nums text-gray-700">
                                    {iv.endAt ? formatDuration(iv.seconds) : formatDuration(currentSessionSeconds)}
                                  </td>
                                </tr>
                              ))}
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
                <form onSubmit={handleSave} className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Title</label>
                    <input
                      value={form.title}
                      disabled={!canManage}
                      onChange={(e) => setForm((f) => (f ? { ...f, title: e.target.value } : f))}
                      className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={form.description}
                      disabled={!canManage}
                      onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                      rows={3}
                      className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Project</label>
                      <select
                        value={form.project_id}
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, project_id: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="">-- Tidak ada --</option>
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
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Client (optional)</label>
                      <select
                        value={form.client_id}
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, client_id: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="">-- Tidak ada --</option>
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
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Priority *</label>
                      <select
                        value={form.priority_id}
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, priority_id: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, task_type_id: e.target.value, related_task_id: '' } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, related_task_id: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="">-- Pilih Task --</option>
                        {opts.relatedTasks
                          .filter((t) => t.value !== taskId)
                          .map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                      </select>
                      {fieldErrors.related_task_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.related_task_id}</p>}
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Status *</label>
                    <select
                      value={form.status_id}
                      disabled={!canManage}
                      onChange={(e) => setForm((f) => (f ? { ...f, status_id: e.target.value } : f))}
                      className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Assignee</label>
                    {opts.canAssignOthers ? (
                      <select
                        value={form.assigned_to}
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, assigned_to: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                        {label(opts.assignees, form.assigned_to)}
                      </p>
                    )}
                    {opts.canAssignOthers && canManage && form.assigned_to !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => (f ? { ...f, assigned_to: currentUserId } : f))}
                        className="mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Assign to me
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
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, start_date: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Due Date</label>
                      <input
                        type="datetime-local"
                        value={form.due_date}
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, due_date: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
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
                        disabled={!canManage}
                        onChange={(e) => setForm((f) => (f ? { ...f, estimated_hours: e.target.value } : f))}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                      />
                      {fieldErrors.estimated_hours && <p className="mt-1 text-xs text-red-600">{fieldErrors.estimated_hours}</p>}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {saving ? 'Menyimpan...' : 'Save changes'}
                      </button>
                    </div>
                  )}
                </form>

                <TaskComments taskId={taskId} currentUserId={currentUserId} canDeleteAny={permissions.canDelete} />
              </div>
            </div>
          </div>
        )}

        {!loading && task && (
          <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-5 py-3 text-xs text-gray-400">
            <div>
              {task.created_at && <p>Created: {formatLogTimestamp(task.created_at)}</p>}
              {task.updated_at && <p>Last updated: {formatLogTimestamp(task.updated_at)}</p>}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
