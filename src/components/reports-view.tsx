'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EnrichedTask } from '@/lib/reports/types';
import { summarizeTasks } from '@/lib/reports/summarize';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { DonutChart } from '@/components/charts/donut-chart';
import { VerticalBarChart } from '@/components/charts/vertical-bar-chart';
import { LineChart, type LineChartPoint } from '@/components/charts/line-chart';
import { useLanguage } from '@/components/language-provider';

type Option = { value: string; label: string };

const ALL = '';

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isoWeekValueOf(date: Date): string {
  // Format native <input type="week"> ("YYYY-Www") dari tanggal apa pun — dipakai untuk nilai
  // default "minggu ini" saat halaman pertama kali dibuka.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}
/** Senin dari ISO week string "YYYY-Www". */
function isoWeekToMonday(value: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

type AppliedFilter = { userId: string; periodType: PeriodType; start: string; end: string; label: string };

/** Hitung rentang [start, end] dari kombinasi Period + nilainya (Fase 10 — video-fidelity pass).
 *  Meniru persis model filter aplikasi lama: 1 field "Period" (Daily/Weekly/Monthly/Yearly) + 1
 *  field nilai yang bentuknya berubah sesuai Period, BUKAN filter bebas multi-kolom seperti
 *  sebelumnya. Return null kalau nilainya belum lengkap/valid. */
function computeRange(periodType: PeriodType, value: string): { start: string; end: string; label: string } | null {
  if (periodType === 'daily') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    return { start: value, end: value, label: value };
  }
  if (periodType === 'weekly') {
    const monday = isoWeekToMonday(value);
    if (!monday) return null;
    return { start: monday, end: addDaysStr(monday, 6), label: value };
  }
  if (periodType === 'monthly') {
    const m = /^(\d{4})-(\d{2})$/.exec(value);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const start = `${m[1]}-${m[2]}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start, end, label: value };
  }
  // yearly
  if (!/^\d{4}$/.test(value)) return null;
  return { start: `${value}-01-01`, end: `${value}-12-31`, label: value };
}

function computeTrendPoints(tasks: EnrichedTask[], range: { start: string; end: string }, periodType: PeriodType): LineChartPoint[] {
  if (periodType === 'yearly') {
    const year = range.start.slice(0, 4);
    return Array.from({ length: 12 }, (_, i) => {
      const monthKey = `${year}-${pad2(i + 1)}`;
      const count = tasks.filter((t) => t.due_date && t.due_date.slice(0, 7) === monthKey).length;
      return { key: monthKey, label: monthKey, value: count };
    });
  }
  const points: LineChartPoint[] = [];
  let cursor = range.start;
  let guard = 0;
  while (cursor <= range.end && guard < 366) {
    const count = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) === cursor).length;
    points.push({ key: cursor, label: cursor.slice(5), value: count });
    cursor = addDaysStr(cursor, 1);
    guard += 1;
  }
  return points;
}

function uniqueOptions(tasks: EnrichedTask[], idKey: keyof EnrichedTask, nameKey: keyof EnrichedTask): Option[] {
  const map = new Map<string, string>();
  tasks.forEach((t) => {
    const id = t[idKey] as string;
    const name = t[nameKey] as string;
    if (id) map.set(id, name || id);
  });
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function toCsvValue(v: string): string {
  if (v == null) return '';
  const needsQuote = /[",\n]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

function formatDisplayDate(value: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReportsView({ canExport }: { canExport: boolean }) {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Form (draft) — hanya diterapkan ke `applied` saat tombol Apply diklik, meniru video (bukan
  // filter instan tiap keystroke seperti implementasi lama).
  const [draftUserId, setDraftUserId] = useState(ALL);
  const [draftPeriodType, setDraftPeriodType] = useState<PeriodType>('monthly');
  const [draftValue, setDraftValue] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM (bulan ini)

  const [applied, setApplied] = useState<AppliedFilter>(() => {
    const now = new Date();
    const monthValue = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const range = computeRange('monthly', monthValue)!;
    return { userId: ALL, periodType: 'monthly', ...range };
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/api/reports/tasks');
        const json = await parseJsonSafe(res);
        if (!res.ok) throw new Error(json.error || t('toast_reports_load_failed'));
        setTasks(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('toast_reports_load_failed'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userOptions = useMemo(() => uniqueOptions(tasks, 'assigned_to', 'assigned_to_name'), [tasks]);

  function handlePeriodTypeChange(next: PeriodType) {
    setDraftPeriodType(next);
    const now = new Date();
    if (next === 'daily') setDraftValue(todayStr());
    else if (next === 'weekly') setDraftValue(isoWeekValueOf(now));
    else if (next === 'monthly') setDraftValue(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
    else setDraftValue(String(now.getFullYear()));
  }

  function handleApply() {
    const range = computeRange(draftPeriodType, draftValue);
    if (!range) {
      setError(t('toast_reports_period_invalid'));
      return;
    }
    setError(null);
    setApplied({ userId: draftUserId, periodType: draftPeriodType, ...range });
  }

  const filtered = useMemo(() => {
    return tasks.filter((tk) => {
      if (applied.userId && tk.assigned_to !== applied.userId) return false;
      if (!tk.due_date) return false;
      const d = tk.due_date.slice(0, 10);
      return d >= applied.start && d <= applied.end;
    });
  }, [tasks, applied]);

  const summary = useMemo(() => summarizeTasks(filtered), [filtered]);
  const pending = summary.total - summary.completed;
  const completionRate = summary.total === 0 ? 0 : Math.round((summary.completed / summary.total) * 100);
  const trendPoints = useMemo(() => computeTrendPoints(filtered, applied, applied.periodType), [filtered, applied]);

  const REPORT_HEADERS = [
    t('col_title'),
    t('col_project'),
    t('col_priority'),
    t('col_status'),
    t('col_assignee'),
    t('td_field_due_date'),
  ];

  function reportRows(): string[][] {
    return filtered.map((tk) => [
      tk.title,
      tk.project_name,
      tk.priority_name,
      tk.status_name,
      tk.assigned_to_name,
      tk.due_date,
    ]);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportExcel() {
    setExportOpen(false);
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([REPORT_HEADERS, ...reportRows()]);
    sheet['!cols'] = REPORT_HEADERS.map(() => ({ wch: 20 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(
      new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `report-${applied.label}.xlsx`
    );
  }

  async function exportPdf() {
    setExportOpen(false);
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(t('reports_pdf_title'), 14, 16);
    doc.setFontSize(9);
    doc.text(
      `${t('reports_pdf_printed_label')}: ${new Date().toLocaleString('en-US')} — ${t('reports_pdf_total_label')}: ${summary.total}, ${t('reports_card_done')}: ${summary.completed}, ${t('reports_card_overdue')}: ${summary.overdue}`,
      14,
      22
    );
    autoTable(doc, {
      startY: 27,
      head: [REPORT_HEADERS],
      body: reportRows(),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [17, 24, 39] },
    });
    doc.save(`report-${applied.label}.pdf`);
  }

  function handlePrint() {
    window.print();
  }

  function exportCsv() {
    setExportOpen(false);
    const lines = [REPORT_HEADERS.map(toCsvValue).join(',')];
    reportRows().forEach((row) => lines.push(row.map(toCsvValue).join(',')));
    const csv = '﻿' + lines.join('\n'); // BOM supaya Excel baca UTF-8 dengan benar
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `report-${applied.label}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-semibold text-gray-900">{t('nav_report')}</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePrint}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('reports_btn_print')}
          </button>
          {canExport && (
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {t('reports_btn_export')}
                <svg className={`h-3.5 w-3.5 transition-transform ${exportOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-20 mt-2 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-popover">
                  <button onClick={exportCsv} disabled={filtered.length === 0} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40">
                    CSV
                  </button>
                  <button onClick={exportExcel} disabled={filtered.length === 0} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40">
                    Excel
                  </button>
                  <button onClick={exportPdf} disabled={filtered.length === 0} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40">
                    PDF
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Filter Period, seperti video: User + Period + nilai periode (berubah bentuk) + Apply */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card print:hidden">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('reports_label_user')}</label>
            <select
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value={ALL}>{t('reports_option_all_users')}</option>
              {userOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('reports_label_period')}</label>
            <select
              value={draftPeriodType}
              onChange={(e) => handlePeriodTypeChange(e.target.value as PeriodType)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="daily">{t('reports_period_daily')}</option>
              <option value="weekly">{t('reports_period_weekly')}</option>
              <option value="monthly">{t('reports_period_monthly')}</option>
              <option value="yearly">{t('reports_period_yearly')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {draftPeriodType === 'daily' && t('reports_label_select_date')}
              {draftPeriodType === 'weekly' && t('reports_label_select_week')}
              {draftPeriodType === 'monthly' && t('reports_label_select_month')}
              {draftPeriodType === 'yearly' && t('reports_label_select_year')}
            </label>
            {draftPeriodType === 'yearly' ? (
              <input
                type="number"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                placeholder={t('reports_ph_year')}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
              />
            ) : (
              <input
                type={draftPeriodType === 'daily' ? 'date' : draftPeriodType === 'weekly' ? 'week' : 'month'}
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
              />
            )}
          </div>
          <div className="flex items-end">
            <button
              onClick={handleApply}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 lg:w-auto"
            >
              {t('action_apply')}
            </button>
          </div>
        </div>
      </div>

      {/* Ringkasan — 4 + 3 kartu seperti video */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label={t('reports_card_total_tasks')} value={summary.total} />
        <SummaryCard label={t('reports_card_done')} value={summary.completed} />
        <SummaryCard label={t('reports_card_pending')} value={pending} />
        <SummaryCard label={t('reports_card_overdue')} value={summary.overdue} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label={t('reports_card_completion_rate')} value={`${completionRate}%`} />
        {/* Hours Worked & Average Duration: di video, kedua kartu ini SELALU menampilkan "N/A" di
            semua kombinasi Period/User yang direkam (termasuk saat ada task selesai) — kemungkinan
            metrik ini belum benar-benar dihitung di aplikasi lama juga. Ditiru apa adanya daripada
            menerka-nerka rumus yang tidak pernah terlihat bekerja di video. */}
        <SummaryCard label={t('reports_card_hours_worked')} value="N/A" />
        <SummaryCard label={t('reports_card_avg_duration')} value="N/A" />
      </div>

      {/* Charts — 3 seperti video: Task Status (donut), Priority Distribution (bar), Due Date Trend (line) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title={t('reports_chart_task_status')}>
          <DonutChart items={summary.byStatus.map((s) => ({ key: s.statusId, label: s.statusName, count: s.count }))} />
        </ChartCard>
        <ChartCard title={t('reports_chart_priority_distribution')}>
          <VerticalBarChart
            items={summary.byPriority.map((p) => ({ key: p.priorityId, label: p.priorityName, count: p.count }))}
            barClassName="bg-blue-500"
          />
        </ChartCard>
        <ChartCard title={t('reports_chart_due_date_trend')}>
          <LineChart points={trendPoints} valueSuffix="" emptyTitle={t('dashboard_no_data_yet')} />
        </ChartCard>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('reports_table_heading')}{' '}
            <span className="font-normal text-gray-400">
              ({filtered.length} {filtered.length === 1 ? t('reports_table_word_singular') : t('reports_table_word_plural')} {t('reports_table_in_range_suffix')})
            </span>
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t('col_title')}</th>
              <th className="px-4 py-2.5 font-medium">{t('col_project')}</th>
              <th className="px-4 py-2.5 font-medium">{t('col_priority')}</th>
              <th className="px-4 py-2.5 font-medium">{t('col_status')}</th>
              <th className="px-4 py-2.5 font-medium">{t('col_assignee')}</th>
              <th className="px-4 py-2.5 font-medium">{t('td_field_due_date')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  {t('common_loading')}
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  {t('reports_empty_state')}
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((tk) => (
                <tr key={tk.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{tk.title}</td>
                  <td className="px-4 py-2.5 text-gray-700">{tk.project_name || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{tk.priority_name || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{tk.status_name || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{tk.assigned_to_name || '-'}</td>
                  <td className="px-4 py-2.5">
                    <span className={tk.is_overdue ? 'font-medium text-red-600' : 'text-gray-700'}>{formatDisplayDate(tk.due_date)}</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-tight text-gray-900">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  // Bugfix (permintaan user Round 8): sama seperti ChartCard di dashboard-view.tsx — `min-w-0`
  // supaya kartu ini bisa menyusut mengikuti lebar kolom grid, tidak ikut melebar keluar kolom
  // gara-gara label panjang di dalam VerticalBarChart. Lihat catatan lengkap di
  // charts/vertical-bar-chart.tsx.
  // Bugfix (permintaan user Round 9): flex-col + pembungkus `flex-1 justify-center` supaya celah
  // atas/bawah di dalam kartu ini SEIMBANG (bukan cuma celah bawah yang besar gara-gara CSS Grid
  // menyamakan tinggi kartu satu baris ke kartu tertinggi) — lihat catatan lengkap & alasan penuh
  // di ChartCard versi dashboard-view.tsx (komponen ini persis sama, sengaja diduplikasi supaya
  // reports-view.tsx tidak bergantung pada file lain).
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">{title}</h3>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}
