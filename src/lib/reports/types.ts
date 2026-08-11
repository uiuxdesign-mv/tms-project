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

export type TaskSummary = {
  total: number;
  overdue: number;
  dueSoon: number;
  byStatus: StatusBreakdown[];
  byPriority: PriorityBreakdown[];
};
