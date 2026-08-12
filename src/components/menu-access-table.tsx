'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';
import { useLanguage } from '@/components/language-provider';
import type { TranslationKey } from '@/lib/i18n/translations';

type RoleOption = { value: string; label: string; roleKey: string };
type MenuDef = { key: string; label: string; href: string };
type MatrixRow = {
  menu_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
};

// Bugfix (permintaan user, item i18n): label aksi ini dulu string statis Indonesia — sekarang
// di-resolve lewat translation key di dalam komponen (lihat ACTION_DEFS + resolveActions di bawah)
// supaya ikut berganti ID/EN.
const ACTION_DEFS: { key: keyof Omit<MatrixRow, 'menu_key'>; labelKey: TranslationKey }[] = [
  { key: 'can_view', labelKey: 'menu_access_action_view' },
  { key: 'can_create', labelKey: 'menu_access_action_create' },
  { key: 'can_edit', labelKey: 'menu_access_action_edit' },
  { key: 'can_delete', labelKey: 'menu_access_action_delete' },
  { key: 'can_export', labelKey: 'menu_access_action_export' },
];

export default function MenuAccessTable() {
  const toast = useToast();
  const { t } = useLanguage();
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [menus, setMenus] = useState<MenuDef[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingRoles(true);
      try {
        const res = await apiFetch('/api/menu-access/roles');
        const json = await parseJsonSafe(res);
        if (!res.ok) throw new Error(json.error || t('toast_menu_access_load_roles_failed'));
        setRoles(json.data);
        if (json.data.length > 0) setSelectedRoleId(json.data[0].value);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('toast_menu_access_load_roles_failed'));
      } finally {
        setLoadingRoles(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMatrix = useCallback(async (roleId: string) => {
    if (!roleId) return;
    setLoadingMatrix(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await apiFetch(`/api/menu-access?role_id=${encodeURIComponent(roleId)}`);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_menu_access_load_matrix_failed'));
      setMenus(json.data.menus);
      setMatrix(json.data.matrix);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_menu_access_load_matrix_failed'));
    } finally {
      setLoadingMatrix(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedRoleId) loadMatrix(selectedRoleId);
  }, [selectedRoleId, loadMatrix]);

  function toggle(menuKey: string, action: keyof Omit<MatrixRow, 'menu_key'>) {
    setMatrix((prev) =>
      prev.map((row) => {
        if (row.menu_key !== menuKey) return row;
        const next = { ...row, [action]: !row[action] };
        // Kalau "Lihat" dimatikan, aksi lain juga dimatikan (tidak masuk akal boleh tambah/ubah/hapus
        // tanpa boleh lihat menunya).
        if (action === 'can_view' && !next.can_view) {
          next.can_create = false;
          next.can_edit = false;
          next.can_delete = false;
        }
        // Kalau aksi lain dinyalakan, otomatis nyalakan "Lihat".
        if (action !== 'can_view' && next[action]) {
          next.can_view = true;
        }
        return next;
      })
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await apiFetch('/api/menu-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: selectedRoleId, matrix }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_menu_access_save_failed'));
      setMatrix(json.data.matrix);
      setSavedMsg(t('toast_menu_access_saved'));
      toast.success(t('toast_menu_access_saved'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('toast_menu_access_save_failed');
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-200 p-4">
        <h1 className="text-lg font-semibold text-gray-900">{t('menu_access_page_title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('menu_access_subtitle')}</p>
      </div>

      <div className="border-b border-gray-200 p-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('menu_access_role_label')}</label>
        {loadingRoles ? (
          <p className="text-sm text-gray-400">{t('menu_access_loading_roles')}</p>
        ) : roles.length === 0 ? (
          <p className="text-sm text-gray-400">{t('menu_access_no_roles')}</p>
        ) : (
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="select-field w-full max-w-xs appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {savedMsg && <div className="border-b border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">{savedMsg}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t('menu_access_col_menu')}</th>
              {ACTION_DEFS.map((a) => (
                <th key={a.key} className="px-4 py-2 text-center font-medium">
                  {t(a.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingMatrix && (
              <tr>
                <td colSpan={ACTION_DEFS.length + 1} className="px-4 py-6 text-center text-gray-400">
                  {t('common_loading')}
                </td>
              </tr>
            )}
            {!loadingMatrix &&
              matrix.map((row) => (
                <tr key={row.menu_key} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-700">
                    {menus.find((m) => m.key === row.menu_key)?.label || row.menu_key}
                  </td>
                  {ACTION_DEFS.map((a) => (
                    <td key={a.key} className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row[a.key]}
                        onChange={() => toggle(row.menu_key, a.key)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus-ring"
                      />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end p-4">
        <button
          onClick={handleSave}
          disabled={saving || loadingMatrix || !selectedRoleId}
          className="focus-ring rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? t('menu_access_saving') : t('menu_access_save_button')}
        </button>
      </div>
    </div>
  );
}
