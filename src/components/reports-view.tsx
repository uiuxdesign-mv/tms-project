'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EnrichedTask } from '@/lib/reports/types';
import { summarizeTasks } from '@/lib/reports/summarize';
import { apiFetch } from '@/lib/csrf-client';
import { DonutChart } from '@/components/charts/donut-chart';
import { VerticalBarChart } from '@/components/charts/vertical-bar-chart';
import { LineChart, type LineChartPoint } from '@/components/charts/line-chart';

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
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Gagal memuat data laporan.');
        setTasks(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat data laporan.');
      } finally {
        setLoading(false);
      }
    })();
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
      setError('Nilai periode belum lengkap/valid.');
      return;
    }
    setError(null);
    setApplied({ userId: draftUserId, periodType: draftPeriodType, ...range });
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (applied.userId && t.assigned_to !== applied.userId) return false;
      if (!t.due_date) return false;
      const d = t.due_date.slice(0, 10);
      return d >= applied.start && d <= applied.end;
    });
  }, [tasks, applied]);

  const summary = useMemo(() => summarizeTasks(filtered), [filtered]);
  const pending = summary.total - summary.completed;
  const completionRate = summary.total === 0 ? 0 : Math.round((summary.completed / summary.total) * 100);
  const trendPoints = useMemo(() => computeTrendPoints(filtered, applied, applied.periodType), [filtered, applied]);

  const REPORT_HEADERS = ['Title', 'Project', 'Priority', 'Status', 'Assignee', 'Due Date'];

  function reportRows(): string[][] {
    return filtered.map((t) => [
      t.title,
      t.project_name,
      t.priority_name,
      t.status_name,
      t.assigned_to_name,
      t.due_date,
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
    doc.text('Report — TMS', 14, 16);
    doc.setFontSize(9);
    doc.text(
      `Printed: ${new Date().toLocaleString('en-US')} — Total: ${summary.total}, Done: ${summary.completed}, Overdue: ${summary.overdue}`,
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
        <h1 className="text-xl font-semibold text-gray-900">Report</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePrint}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Print
          </button>
          {canExport && (
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Export
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
            <label className="mb-1.5 block text-sm font-medium text-gray-700">User</label>
            <select
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value={ALL}>All Users</option>
              {userOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Period</label>
            <select
              value={draftPeriodType}
              onChange={(e) => handlePeriodTypeChange(e.target.value as PeriodType)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {draftPeriodType === 'daily' && 'Select Date'}
              {draftPeriodType === 'weekly' && 'Select Week'}
              {draftPeriodType === 'monthly' && 'Select Month'}
              {draftPeriodType === 'yearly' && 'Select Year'}
            </label>
            {draftPeriodType === 'yearly' ? (
              <input
                type="number"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
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
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Ringkasan — 4 + 3 kartu seperti video */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Tasks" value={summary.total} />
        <SummaryCard label="Done" value={summary.completed} />
        <SummaryCard label="Pending" value={pending} />
        <SummaryCard label="Overdue" value={summary.overdue} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Completion Rate" value={`${completionRate}%`} />
        {/* Hours Worked & Average Duration: di video, kedua kartu ini SELALU menampilkan "N/A" di
            semua kombinasi Period/User yang direkam (termasuk saat ada task selesai) — kemungkinan
            metrik ini belum benar-benar dihitung di aplikasi lama juga. Ditiru apa adanya daripada
            menerka-nerka rumus yang tidak pernah terlihat bekerja di video. */}
        <SummaryCard label="Hours Worked" value="N/A" />
        <SummaryCard label="Average Duration" value="N/A" />
      </div>

      {/* Charts — 3 seperti video: Task Status (donut), Priority Distribution (bar), Due Date Trend (line) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Task Status">
          <DonutChart items={summary.byStatus.map((s) => ({ key: s.statusId, label: s.statusName, count: s.count }))} />
        </ChartCard>
        <ChartCard title="Priority Distribution">
          <VerticalBarChart
            items={summary.byPriority.map((p) => ({ key: p.priorityId, label: p.priorityName, count: p.count }))}
            barClassName="bg-blue-500"
          />
        </ChartCard>
        <ChartCard title="Due Date Trend">
          <LineChart points={trendPoints} valueSuffix="" emptyTitle="No data yet" />
        </ChartCard>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Task Table <span className="font-normal text-gray-400">({filtered.length} task{filtered.length === 1 ? '' : 's'} in range)</span>
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Project</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Assignee</th>
              <th className="px-4 py-2.5 font-medium">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Tidak ada task pada rentang ini.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{t.title}</td>
                  <td className="px-4 py-2.5 text-gray-700">{t.project_name || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{t.priority_name || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{t.status_name || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{t.assigned_to_name || '-'}</td>
                  <td className="px-4 py-2.5">
                    <span className={t.is_overdue ? 'font-medium text-red-600' : 'text-gray-700'}>{formatDisplayDate(t.due_date)}</span>
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
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}
