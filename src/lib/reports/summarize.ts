import type { EnrichedTask, TaskSummary } from './types';

/**
 * Hitung ringkasan (jumlah per status, per prioritas, terlambat, jatuh tempo dekat) dari
 * sekumpulan task yang sudah di-enrich. Fungsi murni (tidak ada I/O) supaya bisa dipakai
 * baik di server (dashboard SSR) maupun di client (halaman Report, dihitung ulang tiap filter berubah).
 */
export function summarizeTasks(tasks: EnrichedTask[]): TaskSummary {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in7Str = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const statusCounts = new Map<string, { statusName: string; count: number; isFinal: boolean }>();
  const priorityCounts = new Map<string, { priorityName: string; count: number }>();
  let overdue = 0;
  let dueSoon = 0;

  for (const t of tasks) {
    const statusKey = t.status_id || '_none';
    const statusEntry = statusCounts.get(statusKey) || {
      statusName: t.status_name || '(Tanpa Status)',
      count: 0,
      isFinal: t.is_final,
    };
    statusEntry.count += 1;
    statusCounts.set(statusKey, statusEntry);

    const priorityKey = t.priority_id || '_none';
    const priorityEntry = priorityCounts.get(priorityKey) || {
      priorityName: t.priority_name || '(Tanpa Prioritas)',
      count: 0,
    };
    priorityEntry.count += 1;
    priorityCounts.set(priorityKey, priorityEntry);

    if (t.is_overdue) overdue += 1;
    if (!t.is_final && t.due_date && t.due_date >= todayStr && t.due_date <= in7Str) dueSoon += 1;
  }

  return {
    total: tasks.length,
    overdue,
    dueSoon,
    byStatus: Array.from(statusCounts.entries())
      .map(([statusId, v]) => ({ statusId, ...v }))
      .sort((a, b) => b.count - a.count),
    byPriority: Array.from(priorityCounts.entries())
      .map(([priorityId, v]) => ({ priorityId, ...v }))
      .sort((a, b) => b.count - a.count),
  };
}
