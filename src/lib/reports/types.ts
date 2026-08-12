/**
 * Tipe murni untuk modul Dashboard & Report (Fase 4) — sengaja dipisah dari
 * `src/lib/models/reports.ts` (yang mengakses Google Sheets) supaya file ini
 * aman diimpor dari komponen client (`'use client'`) tanpa ikut membawa
 * library server-only (googleapis dkk) ke bundle browser.
 */
export type EnrichedTask = {
  id: string;
  title: string;
  client_id: string;
  client_name: string;
  project_id: string;
  project_name: string;
  task_type_id: string;
  task_type_name: string;
  priority_id: string;
  priority_name: string;
  status_id: string;
  status_name: string;
  is_final: boolean;
  /** Status saat ini = status default (awal task baru) — dipakai untuk bucket kartu "To Do". */
  is_default: boolean;
  /** Status saat ini ditandai is_review (tahap review Time Tracking) — bucket kartu "In Review". */
  is_review: boolean;
  assigned_to: string;
  assigned_to_name: string;
  assigned_by: string;
  assigned_by_name: string;
  due_date: string;
  completed_at: string;
  created_at: string;
  is_overdue: boolean;
};

export type StatusBreakdown = { statusId: string; statusName: string; count: number; isFinal: boolean };
export type PriorityBreakdown = { priorityId: string; priorityName: string; count: number };
export type TaskTypeBreakdown = { taskTypeId: string; taskTypeName: string; count: number };
export type AssigneeBreakdown = { userId: string; userName: string; count: number };
export type ProjectBreakdown = { projectId: string; projectName: string; count: number };
export type ClientBreakdown = { clientId: string; clientName: string; count: number };
/** Bucket mingguan untuk chart tren jatuh tempo (Fase 10) — `weekStart` format YYYY-MM-DD (Senin). */
export type DueDateTrendBucket = { weekStart: string; weekLabel: string; count: number; overdueCount: number };

export type TaskSummary = {
  total: number;
  overdue: number;
  dueSoon: number;
  completed: number;
  /** Bucket status turunan flag workflow status (Fase 11 — kartu ringkasan Dashboard baru). */
  todo: number;
  inProgress: number;
  inReview: number;
  byStatus: StatusBreakdown[];
  byPriority: PriorityBreakdown[];
  byTaskType: TaskTypeBreakdown[];
  byAssignee: AssigneeBreakdown[];
  byProject: ProjectBreakdown[];
  byClient: ClientBreakdown[];
  dueDateTrend: DueDateTrendBucket[];
};

/** Satu interval kerja yang sudah "closed" (start/resume -> pause/stop) dari Time Tracking
 * (Fase 8), dipakai Dashboard untuk kartu Jam Kerja Hari Ini/Produktivitas Mingguan, chart Tren
 * Produktivitas, dan feed Pelacakan Waktu Terbaru. */
export type ClosedTimeInterval = {
  taskId: string;
  taskTitle: string;
  userId: string;
  userName: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
};
