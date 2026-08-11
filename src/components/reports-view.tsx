'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EnrichedTask } from '@/lib/reports/types';
import { summarizeTasks } from '@/lib/reports/summarize';
import { apiFetch } from '@/lib/csrf-client';

type Option = { value: string; label: string };

const ALL = '';

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
  const maxStatusCount = Math.max(1, ...summary.byStatus.map((s) => s.count));
  const maxPriorityCount = Math.max(1, ...summary.byPriority.map((p) => p.count));

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
  }

  function exportCsv() {
    const header = [
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
    const lines = [header.map(toCsvValue).join(',')];
    filtered.forEach((t) => {
      lines.push(
        [
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
        ]
          .map(toCsvValue)
          .join(',')
      );
    });
    const csv = '﻿' + lines.join('\n'); // BOM supaya Excel baca UTF-8 dengan benar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-tugas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Report Tugas</h1>
        {canExport && (
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Export CSV
          </button>
        )}
      </div>

      {error && <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Tugas" value={summary.total} />
        <SummaryCard label="Terlambat" value={summary.overdue} tone="red" />
        <SummaryCard label="Jatuh Tempo 7 Hari" value={summary.dueSoon} tone="amber" />
        <SummaryCard label="Ditampilkan" value={filtered.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Berdasarkan Status</h2>
          <div className="space-y-2">
            {summary.byStatus.length === 0 && <p className="text-sm text-gray-400">Tidak ada data.</p>}
            {summary.byStatus.map((s) => (
              <div key={s.statusId}>
                <div className="mb-0.5 flex justify-between text-xs text-gray-600">
                  <span>{s.statusName}</span>
                  <span>{s.count}</span>
                </div>
                <div className="h-2 w-full rounded bg-gray-100">
                  <div
                    className={`h-2 rounded ${s.isFinal ? 'bg-green-500' : 'bg-gray-900'}`}
                    style={{ width: `${(s.count / maxStatusCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Berdasarkan Prioritas</h2>
          <div className="space-y-2">
            {summary.byPriority.length === 0 && <p className="text-sm text-gray-400">Tidak ada data.</p>}
            {summary.byPriority.map((p) => (
              <div key={p.priorityId}>
                <div className="mb-0.5 flex justify-between text-xs text-gray-600">
                  <span>{p.priorityName}</span>
                  <span>{p.count}</span>
                </div>
                <div className="h-2 w-full rounded bg-gray-100">
                  <div className="h-2 rounded bg-blue-500" style={{ width: `${(p.count / maxPriorityCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Filter</h2>
          <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700">
            Reset Filter
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Cari Judul</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik judul tugas..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <SelectFilter label="Client" value={clientId} onChange={setClientId} options={clientOptions} />
          <SelectFilter label="Project" value={projectId} onChange={setProjectId} options={projectOptions} />
          <SelectFilter label="Prioritas" value={priorityId} onChange={setPriorityId} options={priorityOptions} />
          <SelectFilter label="Status" value={statusId} onChange={setStatusId} options={statusOptions} />
          <SelectFilter label="Ditugaskan Ke" value={assignedTo} onChange={setAssignedTo} options={assigneeOptions} />
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Jatuh Tempo Dari</label>
            <input
              type="date"
              value={dueFrom}
              onChange={(e) => setDueFrom(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Jatuh Tempo Sampai</label>
            <input
              type="date"
              value={dueTo}
              onChange={(e) => setDueTo(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          Hanya tampilkan yang terlambat
        </label>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Judul</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Prioritas</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Ditugaskan Ke</th>
              <th className="px-4 py-2 font-medium">Jatuh Tempo</th>
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
                <tr key={t.id}>
                  <td className="px-4 py-2 text-gray-700">{t.title}</td>
                  <td className="px-4 py-2 text-gray-700">{t.client_name || '-'}</td>
                  <td className="px-4 py-2 text-gray-700">{t.project_name || '-'}</td>
                  <td className="px-4 py-2 text-gray-700">{t.priority_name || '-'}</td>
                  <td className="px-4 py-2 text-gray-700">{t.status_name || '-'}</td>
                  <td className="px-4 py-2 text-gray-700">{t.assigned_to_name || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={t.is_overdue ? 'font-medium text-red-600' : 'text-gray-700'}>
                      {t.due_date || '-'}
                      {t.is_overdue && ' (terlambat)'}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' }) {
  const toneClass = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
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
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
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
