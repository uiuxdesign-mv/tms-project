'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useLanguage } from '@/components/language-provider';
import type { TranslationKey } from '@/lib/i18n/translations';

/**
 * Riwayat perubahan task (permintaan user poin 4) — read-only, dimodel dari task-comments.tsx tapi
 * tanpa form (system-generated, tidak pernah diinput manual). field_key disimpan sebagai KEY di
 * server (bukan label Indonesia siap-tayang) supaya label bisa di-resolve sesuai bahasa aktif
 * (ID/EN) di sini lewat translation key yang sudah ada.
 */
type HistoryEntry = {
  id: string;
  task_id: string;
  change_type: 'field' | 'status';
  field_key: string;
  old_value_label: string;
  new_value_label: string;
  changed_by: string;
  changed_by_name: string;
  created_at: string;
};

const FIELD_LABEL_KEYS: Record<string, TranslationKey> = {
  title: 'hist_field_title',
  description: 'hist_field_description',
  client_id: 'hist_field_client',
  project_id: 'hist_field_project',
  task_type_id: 'hist_field_task_type',
  priority_id: 'hist_field_priority',
  assigned_to: 'hist_field_assignee',
  due_date: 'hist_field_due_date',
  start_date: 'hist_field_start_date',
  estimated_hours: 'hist_field_est_hours',
  related_task_id: 'hist_field_related_task',
  status_id: 'col_status',
};

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function TaskHistory({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/history`);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_history_load_failed'));
      setEntries(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_history_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [taskId, t]);

  useEffect(() => {
    load();
  }, [load]);

  function fieldLabel(fieldKey: string): string {
    const key = FIELD_LABEL_KEYS[fieldKey];
    return key ? t(key) : fieldKey;
  }

  function valueLabel(v: string): string {
    return v ? v : t('hist_empty_value');
  }

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        {t('history_heading')} <span className="font-normal text-gray-400">({entries.length})</span>
      </h3>

      {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      <div className="max-h-64 overflow-y-auto">
        {loading && <p className="py-2 text-sm text-gray-400">{t('history_loading')}</p>}
        {!loading && !error && entries.length === 0 && <p className="py-2 text-sm text-gray-400">{t('history_empty')}</p>}
        {!loading && entries.length > 0 && (
          <ul className="space-y-3">
            {entries.map((h) => (
              <li key={h.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{h.changed_by_name}</span>
                  <span className="text-xs text-gray-400">{formatDate(h.created_at)}</span>
                  {h.change_type === 'status' && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[0.625rem] font-medium text-indigo-700">
                      {t('col_status')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-gray-700">
                  <span className="font-medium">{fieldLabel(h.field_key)}</span>{' '}
                  {t('history_changed_from')} &quot;{valueLabel(h.old_value_label)}&quot; {t('history_changed_to')} &quot;
                  {valueLabel(h.new_value_label)}&quot;
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
