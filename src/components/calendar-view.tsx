'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/csrf-client';

type TaskRow = {
  id: string;
  title: string;
  priority_id: string;
  status_id: string;
  assigned_to: string;
  due_date: string;
};

type Option = { value: string; label: string };
type StatusOption = Option & { isFinal: boolean };

type OptionsData = {
  priorities: Option[];
  statuses: StatusOption[];
  assignees: Option[];
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
 * daftar terpisah "Unscheduled" untuk task tanpa `due_date`. Read-only (tidak bisa drag/edit
 * langsung di sini) — klik task untuk lihat detail ringkas, arahkan ke List untuk ubah.
 * `year`/`month` (1-12) dikontrol lewat query string supaya bisa dibagikan/di-bookmark.
 */
export default function CalendarView({ initialYear, initialMonth }: { initialYear: number; initialMonth: number }) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth); // 1-12
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [opts, setOpts] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);

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

  function label(list: Option[] | undefined, value: string) {
    return list?.find((o) => o.value === value)?.label || '-';
  }

  function goToMonth(deltaMonths: number) {
    const d = new Date(year, month - 1 + deltaMonths, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  if (loading) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-400 shadow-sm">Memuat...</div>;
  if (error) return <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  const tasksByDate = new Map<string, TaskRow[]>();
  const unscheduled: TaskRow[] = [];
  for (const t of rows) {
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

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <button onClick={() => goToMonth(-1)} className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50">
            ← Sebelumnya
          </button>
          <h2 className="text-sm font-semibold text-gray-900">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <button onClick={() => goToMonth(1)} className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50">
            Berikutnya →
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
                className={`min-h-[90px] border-b border-r border-gray-100 p-1.5 last:border-r-0 ${cell.date ? '' : 'bg-gray-50'}`}
              >
                {cell.date && (
                  <>
                    <p className={`mb-1 text-xs ${isToday ? 'font-bold text-gray-900' : 'text-gray-400'}`}>{cell.date.getDate()}</p>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((t) => {
                        const status = opts?.statuses.find((s) => s.value === t.status_id);
                        const overdue = !status?.isFinal && dateKey! < todayKey;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTask(t)}
                            className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${
                              overdue ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
                            } hover:opacity-75`}
                            title={t.title}
                          >
                            {t.title}
                          </button>
                        );
                      })}
                      {dayTasks.length > 3 && <p className="px-1 text-[10px] text-gray-400">+{dayTasks.length - 3} lagi</p>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full rounded-lg border border-gray-200 bg-white shadow-sm lg:w-64">
        <div className="border-b border-gray-200 p-3">
          <h3 className="text-sm font-semibold text-gray-900">Unscheduled ({unscheduled.length})</h3>
          <p className="text-xs text-gray-400">Task tanpa Due Date</p>
        </div>
        <div className="max-h-[500px] space-y-1 overflow-y-auto p-2">
          {unscheduled.length === 0 && <p className="p-2 text-center text-xs text-gray-400">Semua task sudah punya due date.</p>}
          {unscheduled.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTask(t)}
              className="block w-full truncate rounded bg-gray-50 px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100"
              title={t.title}
            >
              {t.title}
            </button>
          ))}
        </div>
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedTask(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">{selectedTask.title}</h3>
            <dl className="mt-3 space-y-1 text-sm text-gray-600">
              <div>
                <dt className="inline font-medium text-gray-700">Status: </dt>
                <dd className="inline">{label(opts?.statuses, selectedTask.status_id)}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-gray-700">Priority: </dt>
                <dd className="inline">{label(opts?.priorities, selectedTask.priority_id)}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-gray-700">Assignee: </dt>
                <dd className="inline">{label(opts?.assignees, selectedTask.assigned_to)}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-gray-700">Due Date: </dt>
                <dd className="inline">{selectedTask.due_date || '-'}</dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSelectedTask(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Tutup
              </button>
              <Link
                href="/tasks"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Ubah di List →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
