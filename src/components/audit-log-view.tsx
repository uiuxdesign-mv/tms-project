'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildCsv, downloadCsv } from '@/lib/csv';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { Badge } from '@/components/badge';
import { PaginationBar } from '@/components/table-controls';
import { useLanguage } from '@/components/language-provider';

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

const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  create: 'success',
  update: 'warning',
  delete: 'danger',
};

// Perbaikan (permintaan user): sebelumnya "load more" per 100 baris — sekarang pagination
// sungguhan, konsisten dengan tabel data lain (max 10 baris/halaman, lihat use-table-controls.ts).
const PAGE_SIZE = 10;

function uniqueValues(entries: AuditLogEntry[], key: keyof AuditLogEntry): string[] {
  return Array.from(new Set(entries.map((e) => e[key]).filter(Boolean))).sort();
}

export default function AuditLogView() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorName, setActorName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/api/audit-log');
        const json = await parseJsonSafe(res);
        if (!res.ok) throw new Error(json.error || t('toast_audit_load_failed'));
        setEntries(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('toast_audit_load_failed'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const visible = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  // Perbaikan (permintaan user, pagination): setiap filter berubah, balik ke halaman 1 supaya
  // tidak "nyangkut" di halaman yang sudah tidak relevan dengan hasil filter baru. Dipanggil
  // LANGSUNG dari event handler tiap filter (bukan lewat useEffect terpisah) — pola yang sama
  // dengan handleSubmit di task-activity-feed.tsx, supaya tidak menabrak lint
  // `react-hooks/set-state-in-effect`.
  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
  }
  function handleEntityTypeChange(v: string) {
    setEntityType(v);
    setPage(1);
  }
  function handleActionChange(v: string) {
    setAction(v);
    setPage(1);
  }
  function handleActorNameChange(v: string) {
    setActorName(v);
    setPage(1);
  }
  function handleDateFromChange(v: string) {
    setDateFrom(v);
    setPage(1);
  }
  function handleDateToChange(v: string) {
    setDateTo(v);
    setPage(1);
  }

  function resetFilters() {
    setSearch('');
    setEntityType('');
    setAction('');
    setActorName('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  function exportCsv() {
    const actionLabel: Record<string, string> = {
      create: t('audit_action_create'),
      update: t('audit_action_update'),
      delete: t('audit_action_delete'),
    };
    const header = [
      t('audit_col_time'),
      t('audit_col_actor'),
      t('audit_col_action'),
      t('audit_type_label'),
      t('audit_col_data'),
      t('audit_col_detail'),
    ];
    const lines = [header, ...filtered.map((e) => [e.created_at, e.actor_name, actionLabel[e.action] || e.action, e.entity_type, e.entity_label, e.details])];
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(lines));
  }

  const actionLabel: Record<string, string> = {
    create: t('audit_action_create'),
    update: t('audit_action_update'),
    delete: t('audit_action_delete'),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('audit_page_title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('audit_subtitle')}</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="focus-ring rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {t('audit_export_csv')}
        </button>
      </div>

      {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{t('filter_title')}</h2>
          <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700">
            {t('audit_reset_filter')}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-700">{t('audit_search_label')}</label>
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('audit_search_placeholder')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">{t('audit_type_label')}</label>
            <select
              value={entityType}
              onChange={(e) => handleEntityTypeChange(e.target.value)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="">{t('audit_option_all')}</option>
              {entityTypeOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">{t('audit_action_label')}</label>
            <select
              value={action}
              onChange={(e) => handleActionChange(e.target.value)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="">{t('audit_option_all')}</option>
              <option value="create">{t('audit_action_create')}</option>
              <option value="update">{t('audit_action_update')}</option>
              <option value="delete">{t('audit_action_delete')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">{t('audit_actor_label')}</label>
            <select
              value={actorName}
              onChange={(e) => handleActorNameChange(e.target.value)}
              className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
            >
              <option value="">{t('audit_option_all')}</option>
              {actorOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">{t('audit_date_from_label')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">{t('audit_date_to_label')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t('audit_col_time')}</th>
              <th className="px-4 py-2 font-medium">{t('audit_col_actor')}</th>
              <th className="px-4 py-2 font-medium">{t('audit_col_action')}</th>
              <th className="px-4 py-2 font-medium">{t('audit_col_type')}</th>
              <th className="px-4 py-2 font-medium">{t('audit_col_data')}</th>
              <th className="px-4 py-2 font-medium">{t('audit_col_detail')}</th>
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
                  {t('audit_no_match')}
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-500">{e.created_at.replace('T', ' ').slice(0, 19)}</td>
                  <td className="px-4 py-2 text-gray-700">{e.actor_name || '-'}</td>
                  <td className="px-4 py-2">
                    <Badge label={actionLabel[e.action] || e.action} tone={ACTION_TONE[e.action] || 'neutral'} />
                  </td>
                  <td className="px-4 py-2 text-gray-700">{e.entity_type}</td>
                  <td className="px-4 py-2 text-gray-700">{e.entity_label}</td>
                  <td className="px-4 py-2 text-gray-500">{e.details || '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>

        <PaginationBar
          page={clampedPage}
          totalPages={totalPages}
          totalCount={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
