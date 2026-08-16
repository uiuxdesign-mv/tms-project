'use client';

import { useState } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';
import { useLanguage } from '@/components/language-provider';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';

export type Option = { value: string; label: string };
export type ClientOption = Option & { projectIds: string[] };
export type ProjectOption = Option & { clientId: string };
export type TaskTypeOption = Option & { requiresRelatedTask: boolean };
export type StatusOption = Option & { isFinal: boolean; isDefault: boolean; isReview: boolean; colorCode?: string | null };

export type TaskCreateOptionsData = {
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

/**
 * Modal "Tambah Task" (permintaan user Round 6, poin 1) — diekstrak dari tasks-table.tsx supaya
 * bisa dipakai LANGSUNG oleh List, Kanban, MAUPUN Calendar tanpa perlu pindah view dulu.
 * Sebelumnya Kanban/Calendar tidak punya form Tambah Task sendiri — tombol "+ Add Task" di sana
 * mengarah ke /tasks?new=1, jadi user selalu "terlempar" ke view List dulu baru modalnya kebuka
 * di sana (bug yang dilaporkan user: seharusnya view tetap di Kanban/Calendar, modal langsung
 * kebuka di tempat). Sekarang satu implementasi form ini dipakai bersama oleh ketiga view (di-
 * import & di-mount langsung di komponennya masing-masing, bukan redirect) — field & validasinya
 * tetap konsisten di satu tempat seperti sebelumnya, cuma dibuka in-place.
 */
export default function TaskCreateModal({
  opts,
  currentUserId,
  onClose,
  onCreated,
}: {
  opts: TaskCreateOptionsData;
  currentUserId: string;
  onClose: () => void;
  /** Dipanggil setelah POST /api/tasks berhasil — parent yang memutuskan reload data & menutup modal. */
  onCreated: () => void;
}) {
  const toast = useToast();
  const { t } = useLanguage();

  // Perbaikan (permintaan user): layer utama di belakang modal tidak boleh ikut ke-scroll selama
  // modal ini terbuka (komponen ini selalu mewakili "modal sedang terbuka" — parent selalu
  // conditional-mount/unmount, tidak ada toggle open/close internal).
  useBodyScrollLock(true);

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    assigned_to: opts.canAssignOthers ? '' : currentUserId,
    // Status tidak ditampilkan di form Tambah Task (task baru selalu mulai dari status default
    // workflow) — dipilih otomatis di sini.
    status_id: opts.statuses.find((s) => s.isDefault)?.value || '',
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const selectedTaskType = opts.taskTypes.find((tt) => tt.value === form.task_type_id);
  const showRelatedTask = !!selectedTaskType?.requiresRelatedTask;

  // Client wajib dipilih lebih dulu, daftar Project otomatis terfilter mengikuti Project yang
  // ditautkan ke Client tersebut (tautan multi-select `project_ids` di Master Client). Kalau
  // Client yang dipilih belum ditautkan ke Project manapun, daftar Project TIDAK dikosongkan
  // total — semua Project tetap ditampilkan (fail-open).
  const selectedClient = opts.clients.find((c) => c.value === form.client_id);
  const projectOptions = !form.client_id
    ? []
    : !selectedClient || selectedClient.projectIds.length === 0
      ? opts.projects
      : opts.projects.filter((p) => selectedClient.projectIds.includes(p.value));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else toast.error(json.error || t('toast_save_task_failed'));
        return;
      }
      toast.success(t('toast_task_created'));
      onCreated();
    } catch {
      toast.error(t('toast_network_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
        <div className="shrink-0 border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('tasks_add_modal_title')}</h2>
        </div>
        {/* Tombol aksi (Batal/Simpan) di footer `shrink-0` di luar area scroll, supaya tidak ikut
            ter-scroll dan hilang dari layar kalau field form-nya banyak/panjang. */}
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
                    onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value, project_id: '' }))}
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
                    {projectOptions.map((p) => (
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
                    {opts.relatedTasks.map((rt) => (
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
              onClick={onClose}
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
  );
}
