import type { EnrichedTask, TaskSummary, DueDateTrendBucket } from './types';

/** Senin dari minggu yang memuat `date`, dikembalikan sebagai string YYYY-MM-DD. */
function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Minggu..6=Sabtu
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

/**
 * Hitung tren jatuh tempo mingguan (Fase 10 — dipakai Dashboard chart #5 & Report) — 4 minggu ke
 * belakang + minggu ini + 5 minggu ke depan (10 minggu total), dihitung dari `due_date` task
 * (bukan `created_at`), supaya terlihat pola beban kerja yang akan datang maupun yang baru lewat.
 */
function computeDueDateTrend(tasks: EnrichedTask[]): DueDateTrendBucket[] {
  const thisMonday = mondayOf(new Date());
  const buckets = new Map<string, DueDateTrendBucket>();
  const weekStarts: string[] = [];
  for (let i = -4; i <= 5; i++) {
    const weekStart = addDays(thisMonday, i * 7);
    weekStarts.push(weekStart);
    buckets.set(weekStart, { weekStart, weekLabel: formatWeekLabel(weekStart), count: 0, overdueCount: 0 });
  }
  const firstWeek = weekStarts[0];
  const lastWeekEnd = addDays(weekStarts[weekStarts.length - 1], 6);

  for (const t of tasks) {
    if (!t.due_date) continue;
    if (t.due_date < firstWeek || t.due_date > lastWeekEnd) continue;
    const weekStart = mondayOf(new Date(t.due_date + 'T00:00:00Z'));
    const bucket = buckets.get(weekStart);
    if (!bucket) continue;
    bucket.count += 1;
    if (t.is_overdue) bucket.overdueCount += 1;
  }

  return weekStarts.map((w) => buckets.get(w)!);
}

/**
 * Hitung ringkasan (jumlah per status/prioritas/tipe/assignee, terlambat, jatuh tempo dekat, tren
 * mingguan) dari sekumpulan task yang sudah di-enrich. Fungsi murni (tidak ada I/O) supaya bisa
 * dipakai baik di server (Dashboard SSR) maupun di client (halaman Report, dihitung ulang tiap
 * filter berubah).
 */
export function summarizeTasks(tasks: EnrichedTask[]): TaskSummary {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in7Str = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const statusCounts = new Map<string, { statusName: string; count: number; isFinal: boolean }>();
  const priorityCounts = new Map<string, { priorityName: string; count: number }>();
  const taskTypeCounts = new Map<string, { taskTypeName: string; count: number }>();
  const assigneeCounts = new Map<string, { userName: string; count: number }>();
  let overdue = 0;
  let dueSoon = 0;
  let completed = 0;

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

    const taskTypeKey = t.task_type_id || '_none';
    const taskTypeEntry = taskTypeCounts.get(taskTypeKey) || {
      taskTypeName: t.task_type_name || '(Tanpa Tipe)',
      count: 0,
    };
    taskTypeEntry.count += 1;
    taskTypeCounts.set(taskTypeKey, taskTypeEntry);

    const assigneeKey = t.assigned_to || '_none';
    const assigneeEntry = assigneeCounts.get(assigneeKey) || {
      userName: t.assigned_to_name || '(Belum Ditugaskan)',
      count: 0,
    };
    assigneeEntry.count += 1;
    assigneeCounts.set(assigneeKey, assigneeEntry);

    if (t.is_overdue) overdue += 1;
    if (t.is_final) completed += 1;
    if (!t.is_final && t.due_date && t.due_date >= todayStr && t.due_date <= in7Str) dueSoon += 1;
  }

  return {
    total: tasks.length,
    overdue,
    dueSoon,
    completed,
    byStatus: Array.from(statusCounts.entries())
      .map(([statusId, v]) => ({ statusId, ...v }))
      .sort((a, b) => b.count - a.count),
    byPriority: Array.from(priorityCounts.entries())
      .map(([priorityId, v]) => ({ priorityId, ...v }))
      .sort((a, b) => b.count - a.count),
    byTaskType: Array.from(taskTypeCounts.entries())
      .map(([taskTypeId, v]) => ({ taskTypeId, ...v }))
      .sort((a, b) => b.count - a.count),
    byAssignee: Array.from(assigneeCounts.entries())
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.count - a.count),
    dueDateTrend: computeDueDateTrend(tasks),
  };
}
