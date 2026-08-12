'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildCsv, downloadCsv } from '@/lib/csv';
import { apiFetch } from '@/lib/csrf-client';
import { Badge } from '@/components/badge';

type AuditLogEntry = {
  id: string;
  actor_user_id: string;
  actor_name: string;
  action: 'create' | 'update' | 'delete';
  entity_type: string;
  entity_id: string;
  entity_label: string;
  details: string;
  created_at: string;
};

const ACTION_LABEL: Record<string, string> = { create: 'Tambah', update: 'Ubah', delete: 'Hapus' };
const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  create: 'success',
  update: 'warning',
  delete: 'danger',
};

const PAGE_SIZE_STEP = 100;

function uniqueValues(entries: AuditLogEntry[], key: keyof AuditLogEntry): string[] {
  return Array.from(new Set(entries.map((e) => e[key]).filter(Boolean))).sort();
}

export default function AuditLogView() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorName, setActorName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_STEP);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/api/audit-log');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Gagal memuat audit log.');
        setEntries(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat audit log.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const entityTypeOptions = useMemo(() => uniqueValues(entries, 'entity_type'), [entries]);
  const actorOptions = useMemo(() => uniqueValues(entries, 'actor_name'), [entries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (term && !e.entity_label.toLowerCase().includes(term)) return false;
      if (entityType && e.entity_type !== entityType) return false;
      if (action && e.action !== action) return false;
      if (actorName && e.actor_name !== actorName) return false;
      const dateOnly = e.created_at.slice(0, 10);
      if (dateFrom && dateOnly < dateFrom) return false;
      if (dateTo && dateOnly > dateTo) return false;
      return true;
    });
  }, [entries, search, entityType, action, actorName, dateFrom, dateTo]);

  const visible = filtered.slice(0, visibleCount);

  function resetFilters() {
    setSearch('');
    setEntityType('');
    setAction('');
    setActorName('');
    setDateFrom('');
    setDateTo('');
    setVisibleCount(PAGE_SIZE_STEP);
  }

  function exportCsv() {
    const header = ['Waktu', 'Aktor', 'Aksi', 'Tipe Entitas', 'Entitas', 'Detail'];
    const lines = [header, ...filtered.map((e) => [e.created_at, e.actor_name, ACTION_LABEL[e.action] || e.action, e.entity_type, e.entity_label, e.details])];
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(lines));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Audit Log</h1>
          <p className="mt-1 text-sm text-gray-500">
            Jejak semua aksi Tambah/Ubah/Hapus di Master Data, Users, Tasks, dan perubahan hak akses menu.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="focus-ring rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Filter</h2>
          <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700">
            Reset Filter
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Cari (nama data)</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik nama data..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Tipe Data</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="">-- Semua --</option>
              {entityTypeOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Aksi</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="">-- Semua --</option>
              <option value="create">Tambah</option>
              <option value="update">Ubah</option>
              <option value="delete">Hapus</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Pelaku</label>
            <select
              value={actorName}
              onChange={(e) => setActorName(e.target.value)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="">-- Semua --</option>
              {actorOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Waktu</th>
              <th className="px-4 py-2 font-medium">Pelaku</th>
              <th className="px-4 py-2 font-medium">Aksi</th>
              <th className="px-4 py-2 font-medium">Tipe</th>
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Detail</th>
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
                  Tidak ada log yang cocok dengan filter.
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-500">{e.created_at.replace('T', ' ').slice(0, 19)}</td>
                  <td className="px-4 py-2 text-gray-700">{e.actor_name || '-'}</td>
                  <td className="px-4 py-2">
                    <Badge label={ACTION_LABEL[e.action] || e.action} tone={ACTION_TONE[e.action] || 'neutral'} />
                  </td>
                  <td className="px-4 py-2 text-gray-700">{e.entity_type}</td>
                  <td className="px-4 py-2 text-gray-700">{e.entity_label}</td>
                  <td className="px-4 py-2 text-gray-500">{e.details || '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > visible.length && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE_STEP)}
            className="focus-ring rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat {Math.min(PAGE_SIZE_STEP, filtered.length - visible.length)} lagi ({visible.length}/{filtered.length})
          </button>
        </div>
      )}
    </div>
  );
}
