'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EnrichedTask } from '@/lib/reports/types';
import { summarizeTasks } from '@/lib/reports/summarize';
import { apiFetch } from '@/lib/csrf-client';
import { BarList } from '@/components/charts/bar-list';
import { WeeklyTrendChart } from '@/components/charts/weekly-trend-chart';
import { Badge } from '@/components/badge';

type Option = { value: string; label: string };

const ALL = '';

type PeriodPreset = 'all' | 'this-week' | 'this-month' | 'custom';

/** Senin dari minggu yang memuat `date`, format YYYY-MM-DD. */
function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function lastOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/** Rentang [dari, sampai] untuk 1 preset Period (Fase 10). `custom` mengembalikan null (dikontrol manual lewat 2 input tanggal). */
function periodRange(preset: PeriodPreset): { from: string; to: string } | null {
  const now = new Date();
  if (preset === 'this-week') {
    const monday = mondayOf(now);
    return { from: monday, to: addDaysLocal(monday, 6) };
  }
  if (preset === 'this-month') {
    return { from: firstOfMonth(now), to: lastOfMonth(now) };
  }
  return null;
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

export default function ReportsView({ canExport }: { canExport: boolean }) {
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState(ALL);
  const [projectId, setProjectId] = useState(ALL);
  const [priorityId, setPriorityId] = useState(ALL);
  const [statusId, setStatusId] = useState(ALL);
  const [assignedTo, setAssignedTo] = useState(ALL);
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');

  // Fase 10: filter Period — preset "Minggu Ini"/"Bulan Ini" otomatis mengisi Jatuh Tempo
  // Dari/Sampai; "Kustom" membiarkan kedua input tanggal itu dikontrol manual seperti sebelumnya;
  // "Semua" mengosongkannya lagi.
  function handlePeriodChange(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset === 'all') {
      setDueFrom('');
      setDueTo('');
    } else if (preset === 'this-week' || preset === 'this-month') {
      const range = periodRange(preset);
      if (range) {
        setDueFrom(range.from);
        setDueTo(range.to);
      }
    }
    // 'custom' — biarkan dueFrom/dueTo apa adanya, user isi manual di bawah.
  }

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

  const clientOptions = useMemo(() => uniqueOptions(tasks, 'client_id', 'client_name'), [tasks]);
  const projectOptions = useMemo(() => uniqueOptions(tasks, 'project_id', 'project_name'), [tasks]);
  const priorityOptions = useMemo(() => uniqueOptions(tasks, 'priority_id', 'priority_name'), [tasks]);
  const statusOptions = useMemo(() => uniqueOptions(tasks, 'status_id', 'status_name'), [tasks]);
  const assigneeOptions = useMemo(() => uniqueOptions(tasks, 'assigned_to', 'assigned_to_name'), [tasks]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (term && !t.title.toLowerCase().includes(term)) return false;
      if (clientId && t.client_id !== clientId) return false;
      if (projectId && t.project_id !== projectId) return false;
      if (priorityId && t.priority_id !== priorityId) return false;
      if (statusId && t.status_id !== statusId) return false;
      if (assignedTo && t.assigned_to !== assignedTo) return false;
      if (dueFrom && (!t.due_date || t.due_date < dueFrom)) return false;
      if (dueTo && (!t.due_date || t.due_date > dueTo)) return false;
      if (onlyOverdue && !t.is_overdue) return false;
      return true;
    });
  }, [tasks, search, clientId, projectId, priorityId, statusId, assignedTo, dueFrom, dueTo, onlyOverdue]);

  const summary = useMemo(() => summarizeTasks(filtered), [filtered]);

  function resetFilters() {
    setSearch('');
    setClientId(ALL);
    setProjectId(ALL);
    setPriorityId(ALL);
    setStatusId(ALL);
    setAssignedTo(ALL);
    setDueFrom('');
    setDueTo('');
    setOnlyOverdue(false);
    setPeriodPreset('all');
  }

  const REPORT_HEADERS = [
    'Judul',
    'Client',
    'Project',
    'Tipe Tugas',
    'Prioritas',
    'Status',
    'Ditugaskan Ke',
    'Ditugaskan Oleh',
    'Jatuh Tempo',
    'Selesai Pada',
    'Terlambat',
  ];

  function reportRows(): string[][] {
    return filtered.map((t) => [
      t.title,
      t.client_name,
      t.project_name,
      t.task_type_name,
      t.priority_name,
      t.status_name,
      t.assigned_to_name,
      t.assigned_by_name,
      t.due_date,
      t.completed_at,
      t.is_overdue ? 'Ya' : 'Tidak',
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
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([REPORT_HEADERS, ...reportRows()]);
    sheet['!cols'] = REPORT_HEADERS.map(() => ({ wch: 20 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Laporan Tugas');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(
      new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `laporan-tugas-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  async function exportPdf() {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Laporan Tugas — TMS', 14, 16);
    doc.setFontSize(9);
    doc.text(
      `Dicetak: ${new Date().toLocaleString('id-ID')} — Total: ${summary.total}, Terlambat: ${summary.overdue}, Selesai: ${summary.completed}`,
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
    doc.save(`laporan-tugas-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function handlePrint() {
    window.print();
  }

  function exportCsv() {
    const lines = [REPORT_HEADERS.map(toCsvValue).join(',')];
    reportRows().forEach((row) => lines.push(row.map(toCsvValue).join(',')));
    const csv = '﻿' + lines.join('\n'); // BOM supaya Excel baca UTF-8 dengan benar
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `laporan-tugas-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-semibold text-gray-900">Report Tugas</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePrint}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Print
          </button>
          {canExport && (
            <>
              <button
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                onClick={exportExcel}
                disabled={filtered.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Export Excel
              </button>
              <button
                onClick={exportPdf}
                disabled={filtered.length === 0}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Export PDF
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Total Tugas" value={summary.total} tone="brand" />
        <SummaryCard label="Terlambat" value={summary.overdue} tone="red" />
        <SummaryCard label="Jatuh Tempo 7 Hari" value={summary.dueSoon} tone="amber" />
        <SummaryCard label="Selesai" value={summary.completed} tone="emerald" />
        <SummaryCard label="Ditampilkan" value={filtered.length} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Berdasarkan Status">
          <BarList
            items={summary.byStatus.map((s) => ({
              key: s.statusId,
              label: s.statusName,
              count: s.count,
              colorClassName: s.isFinal ? 'bg-emerald-500' : 'bg-gray-900',
            }))}
          />
        </ChartCard>

        <ChartCard title="Berdasarkan Prioritas">
          <BarList
            items={summary.byPriority.map((p) => ({ key: p.priorityId, label: p.priorityName, count: p.count, colorClassName: 'bg-blue-500' }))}
          />
        </ChartCard>

        <ChartCard title="Berdasarkan Tipe Tugas">
          <BarList
            items={summary.byTaskType.map((t) => ({ key: t.taskTypeId, label: t.taskTypeName, count: t.count, colorClassName: 'bg-purple-500' }))}
          />
        </ChartCard>

        <ChartCard title="Top Assignee">
          <BarList
            items={summary.byAssignee.map((a) => ({ key: a.userId, label: a.userName, count: a.count, colorClassName: 'bg-indigo-500' }))}
            maxItems={8}
          />
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard title="Tren Jatuh Tempo Mingguan">
            <WeeklyTrendChart buckets={summary.dueDateTrend} />
          </ChartCard>
        </div>
      </div>

      {/* Filter */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card print:hidden">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Filter</h2>
          <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700">
            Reset Filter
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Period</label>
            <select
              value={periodPreset}
              onChange={(e) => handlePeriodChange(e.target.value as PeriodPreset)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="all">Semua</option>
              <option value="this-week">Minggu Ini</option>
              <option value="this-month">Bulan Ini</option>
              <option value="custom">Kustom</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cari Judul</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik judul tugas..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
            />
          </div>
          <SelectFilter label="Client" value={clientId} onChange={setClientId} options={clientOptions} />
          <SelectFilter label="Project" value={projectId} onChange={setProjectId} options={projectOptions} />
          <SelectFilter label="Prioritas" value={priorityId} onChange={setPriorityId} options={priorityOptions} />
          <SelectFilter label="Status" value={statusId} onChange={setStatusId} options={statusOptions} />
          <SelectFilter label="Ditugaskan Ke" value={assignedTo} onChange={setAssignedTo} options={assigneeOptions} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Jatuh Tempo Dari</label>
            <input
              type="date"
              value={dueFrom}
              disabled={periodPreset !== 'all' && periodPreset !== 'custom'}
              onChange={(e) => setDueFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Jatuh Tempo Sampai</label>
            <input
              type="date"
              value={dueTo}
              disabled={periodPreset !== 'all' && periodPreset !== 'custom'}
              onChange={(e) => setDueTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => setOnlyOverdue(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus-ring"
          />
          Hanya tampilkan yang terlambat
        </label>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Judul</th>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Project</th>
              <th className="px-4 py-2.5 font-medium">Prioritas</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Ditugaskan Ke</th>
              <th className="px-4 py-2.5 font-medium">Jatuh Tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Tidak ada tugas yang cocok dengan filter.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{t.title}</td>
                  <td className="px-4 py-2.5 text-gray-700">{t.client_name || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{t.project_name || '-'}</td>
                  <td className="px-4 py-2.5">
                    {t.priority_name ? <Badge label={t.priority_name} tone="neutral" /> : <span className="text-gray-700">-</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {t.status_name ? <Badge label={t.status_name} tone={t.is_final ? 'success' : 'neutral'} /> : <span className="text-gray-700">-</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{t.assigned_to_name || '-'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={t.is_overdue ? 'font-medium text-red-600' : 'text-gray-700'}>{t.due_date || '-'}</span>
                      {t.is_overdue && <Badge label="Terlambat" tone="danger" />}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SummaryTone = 'brand' | 'neutral' | 'amber' | 'red' | 'emerald';

const SUMMARY_TONE_CHIP: Record<SummaryTone, string> = {
  brand: 'bg-indigo-50 text-indigo-600',
  neutral: 'bg-gray-100 text-gray-500',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

const SUMMARY_ICON_PATH: Record<SummaryTone, string> = {
  brand: 'M9 12h6m-6 4h6M4.5 6.75A2.25 2.25 0 016.75 4.5h10.5A2.25 2.25 0 0119.5 6.75v10.5A2.25 2.25 0 0117.25 19.5H6.75A2.25 2.25 0 014.5 17.25V6.75z',
  neutral: 'M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z',
  amber: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-8.99 3.75h.008v.008h-.008v-.008z',
  red: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  emerald: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

function SummaryCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: SummaryTone }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SUMMARY_TONE_CHIP[tone]}`}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={SUMMARY_ICON_PATH[tone]} />
        </svg>
      </span>
      <div>
        <p className="text-2xl font-semibold leading-tight text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
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

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
      >
        <option value="">-- Semua --</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
