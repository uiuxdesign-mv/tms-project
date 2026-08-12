'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/csrf-client';

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

const ACTIONS: { key: keyof Omit<MatrixRow, 'menu_key'>; label: string }[] = [
  { key: 'can_view', label: 'Lihat' },
  { key: 'can_create', label: 'Tambah' },
  { key: 'can_edit', label: 'Ubah' },
  { key: 'can_delete', label: 'Hapus' },
  { key: 'can_export', label: 'Ekspor' },
];

export default function MenuAccessTable() {
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
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Gagal memuat daftar role.');
        setRoles(json.data);
        if (json.data.length > 0) setSelectedRoleId(json.data[0].value);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat daftar role.');
      } finally {
        setLoadingRoles(false);
      }
    })();
  }, []);

  const loadMatrix = useCallback(async (roleId: string) => {
    if (!roleId) return;
    setLoadingMatrix(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await apiFetch(`/api/menu-access?role_id=${encodeURIComponent(roleId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memuat hak akses.');
      setMenus(json.data.menus);
      setMatrix(json.data.matrix);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat hak akses.');
    } finally {
      setLoadingMatrix(false);
    }
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan hak akses.');
      setMatrix(json.data.matrix);
      setSavedMsg('Hak akses berhasil disimpan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan hak akses.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-200 p-4">
        <h1 className="text-lg font-semibold text-gray-900">Menu &amp; Access Control</h1>
        <p className="mt-1 text-sm text-gray-500">
          Atur menu apa saja yang boleh dilihat/ditambah/diubah/dihapus oleh tiap role. Role Admin selalu
          punya akses penuh dan tidak diatur di sini.
        </p>
      </div>

      <div className="border-b border-gray-200 p-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Role</label>
        {loadingRoles ? (
          <p className="text-sm text-gray-400">Memuat daftar role...</p>
        ) : roles.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada role selain Admin.</p>
        ) : (
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus-ring"
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
              <th className="px-4 py-2 font-medium">Menu</th>
              {ACTIONS.map((a) => (
                <th key={a.key} className="px-4 py-2 text-center font-medium">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingMatrix && (
              <tr>
                <td colSpan={ACTIONS.length + 1} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            )}
            {!loadingMatrix &&
              matrix.map((row) => (
                <tr key={row.menu_key} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-700">
                    {menus.find((m) => m.key === row.menu_key)?.label || row.menu_key}
                  </td>
                  {ACTIONS.map((a) => (
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
          {saving ? 'Menyimpan...' : 'Simpan Hak Akses'}
        </button>
      </div>
    </div>
  );
}
