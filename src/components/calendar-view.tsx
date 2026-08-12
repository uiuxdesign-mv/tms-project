'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { TasksPageHeader } from '@/components/tasks-view-header';
import { TableSearchBox } from '@/components/table-controls';
import TaskDetailModal from '@/components/task-detail-modal';

type TaskRow = {
  id: string;
  title: string;
  priority_id: string;
  status_id: string;
  assigned_to: string;
  due_date: string;
};

type Option = { value: string; label: string };
type StatusOption = Option & { isFinal: boolean; colorCode?: string | null };

type OptionsData = {
  statuses: StatusOption[];
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Calendar view Task (Fase 8) — grid bulan berjalan menampilkan task berdasarkan `due_date`, plus
 * daftar terpisah "Unscheduled" untuk task tanpa `due_date`.
 *
 * Bugfix (permintaan user): sebelumnya klik task di sini membuka modal ringkas terpisah
 * (read-only, cuma Status/Priority/Assignee/Due Date + link "Ubah di List"). Sekarang pakai
 * `TaskDetailModal` yang SAMA dengan Kanban & List, supaya detail task (Time Tracking, History
 * Log, komentar, form edit) konsisten di semua view — bukan 3 pengalaman berbeda.
 * `year`/`month` (1-12) dikontrol lewat query string supaya bisa dibagikan/di-bookmark.
 */
export default function CalendarView({
  initialYear,
  initialMonth,
  canCreate = true,
  currentUserId,
  isAdmin,
  permissions,
}: {
  initialYear: number;
  initialMonth: number;
  canCreate?: boolean;
  currentUserId: string;
  isAdmin: boolean;
  permissions: { canEdit: boolean };
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth); // 1-12
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [opts, setOpts] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  function goToMonth(deltaMonths: number) {
    const d = new Date(year, month - 1 + deltaMonths, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-400 shadow-card">Memuat...</div>;
  if (error) return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  const term = search.trim().toLowerCase();
  const visibleRows = term ? rows.filter((t) => t.title.toLowerCase().includes(term)) : rows;

  const tasksByDate = new Map<string, TaskRow[]>();
  const unscheduled: TaskRow[] = [];
  for (const t of visibleRows) {
    if (!t.due_date) {
      unscheduled.push(t);
      continue;
    }
    const dateKey = t.due_date.slice(0, 10);
    const list = tasksByDate.get(dateKey) || [];
    list.push(t);
    tasksByDate.set(dateKey, list);
  }

  const firstOfMonth = new Date(year, month - 1, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=Minggu
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = isoDateOnly(new Date());

  const cells: { date: Date | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month - 1, d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  // "Total N tasks due this month" seperti video — jumlah task yang due_date-nya jatuh di bulan
  // yang sedang ditampilkan (bukan total keseluruhan task, dan bukan unscheduled).
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const dueThisMonthCount = [...tasksByDate.entries()].reduce(
    (sum, [dateKey, tasks]) => (dateKey.startsWith(monthPrefix) ? sum + tasks.length : sum),
    0
  );

  return (
    <div>
      <TasksPageHeader
        subtitle={`Total ${dueThisMonthCount} task${dueThisMonthCount === 1 ? '' : 's'} due this month`}
        addTaskHref="/tasks?new=1"
        canCreate={canCreate}
      />
      <div className="mb-3">
        <TableSearchBox value={search} onChange={setSearch} placeholder="Search title..." />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1 rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToMonth(-1)}
              aria-label="Bulan sebelumnya"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-900"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="w-40 text-center text-base font-semibold text-gray-900">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <button
              onClick={() => goToMonth(1)}
              aria-label="Bulan berikutnya"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-900"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => {
              const now = new Date();
              setYear(now.getFullYear());
              setMonth(now.getMonth() + 1);
            }}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-900"
          >
            Hari Ini
          </button>
        </div>
        <div className="grid grid-cols-7 border-b border-gray-200 text-center text-xs font-medium text-gray-500">
          {DAY_NAMES.map((d) => (
            <div key={d} className="border-r border-gray-100 py-1.5 last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const dateKey = cell.date ? isoDateOnly(cell.date) : null;
            const dayTasks = dateKey ? tasksByDate.get(dateKey) || [] : [];
            const isToday = dateKey === todayKey;
            return (
              <div
                key={i}
                className={`min-h-[7rem] border-b border-r border-gray-100 p-1.5 last:border-r-0 ${cell.date ? '' : 'bg-gray-50/60'}`}
              >
                {cell.date && (
                  <>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        isToday ? 'bg-indigo-600 text-white' : 'text-gray-500'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayTasks.slice(0, 3).map((t) => {
                        const status = opts?.statuses.find((s) => s.value === t.status_id);
                        return (
                          <button
                            key={t.id}
                            onClick={() => setDetailTaskId(t.id)}
                            className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-gray-900 hover:bg-gray-100"
                            style={{ borderLeft: `3px solid ${status?.colorCode || '#94a3b8'}` }}
                            title={t.title}
                          >
                            {t.title}
                          </button>
                        );
                      })}
                      {dayTasks.length > 3 && <p className="px-1.5 text-[11px] text-gray-400">+{dayTasks.length - 3} lagi</p>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full rounded-2xl border border-gray-200 bg-white shadow-card lg:w-64">
        <div className="border-b border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Unscheduled <span className="font-normal text-gray-400">({unscheduled.length})</span>
          </h3>
          <p className="text-xs text-gray-400">Task tanpa Due Date</p>
        </div>
        <div className="max-h-[500px] divide-y divide-gray-100 overflow-y-auto p-2">
          {unscheduled.length === 0 && <p className="p-2 text-center text-xs text-gray-400">Semua task sudah punya due date.</p>}
          {unscheduled.map((t) => (
            <button
              key={t.id}
              onClick={() => setDetailTaskId(t.id)}
              className="block w-full truncate px-2 py-2 text-left text-sm font-medium text-gray-900 hover:text-indigo-600"
              title={t.title}
            >
              {t.title}
            </button>
          ))}
        </div>
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
