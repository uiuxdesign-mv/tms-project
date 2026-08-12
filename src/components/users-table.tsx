'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { parseCsv, buildCsv, downloadCsv } from '@/lib/csv';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useTableControls } from '@/lib/hooks/use-table-controls';
import { SortableHeader, TableSearchBox, PaginationBar } from '@/components/table-controls';
import { Badge, StatusBadge } from '@/components/badge';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role_id: string;
  employment_type_id: string;
  can_assign_others: string;
  status: string;
  must_change_password: string;
  phone: string;
  department: string;
};

type RoleOption = { value: string; label: string; roleKey: string; active: boolean };
type EmploymentTypeOption = { value: string; label: string; canAssignToOthers: boolean; active: boolean };
type ImportRowResult = { rowNumber: number; title: string; ok: boolean; message: string };

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role_id: '',
  employment_type_id: '',
  can_assign_others: 'Tidak',
  status: 'Active',
  phone: '',
  department: '',
};

type Permissions = { canCreate: boolean; canEdit: boolean; canDelete: boolean };

export default function UsersTable({
  currentUserId,
  permissions,
}: {
  currentUserId: string;
  permissions: Permissions;
}) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState<ImportRowResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, optsRes] = await Promise.all([apiFetch('/api/users'), apiFetch('/api/users/options')]);
      const usersJson = await usersRes.json();
      const optsJson = await optsRes.json();
      if (!usersRes.ok) throw new Error(usersJson.error || 'Gagal memuat data.');
      setRows(usersJson.data);
      setRoles(optsJson.data.roles);
      setEmploymentTypes(optsJson.data.employmentTypes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRole = roles.find((r) => r.value === form.role_id);
  const isAdminRole = selectedRole?.roleKey === 'admin';
  const selectedEmploymentType = employmentTypes.find((e) => e.value === form.employment_type_id);
  const showCanAssign = !isAdminRole && !!selectedEmploymentType?.canAssignToOthers;

  // Role/Tipe Kepegawaian yang sudah Inactive disembunyikan dari pilihan baru, KECUALI itu
  // adalah nilai yang sedang dipakai user yang sedang diedit (supaya nilai lama tetap terlihat).
  const roleOptionsForForm = roles.filter((r) => r.active || r.value === form.role_id);
  const employmentTypeOptionsForForm = employmentTypes.filter((e) => e.active || e.value === form.employment_type_id);

  function openCreateModal() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEditModal(row: UserRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      email: row.email,
      password: '',
      role_id: row.role_id,
      employment_type_id: row.employment_type_id,
      can_assign_others: row.can_assign_others || 'Tidak',
      status: row.status,
      phone: row.phone || '',
      department: row.department || '',
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const url = editingId ? `/api/users/${editingId}` : '/api/users';
      const method = editingId ? 'PATCH' : 'POST';
      const payload: Record<string, string> = { ...form };
      if (editingId && !payload.password) delete payload.password; // biarkan password lama kalau tidak diisi

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else setError(json.error || 'Gagal menyimpan data.');
        return;
      }
      setModalOpen(false);
      await load();
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: UserRow) {
    const ok = await confirmDialog({ message: `Nonaktifkan user "${row.name}"?`, confirmLabel: 'Nonaktifkan', danger: true });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/users/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Gagal menghapus data.');
        return;
      }
      await load();
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
    }
  }

  // Fase 10: search/sort/pagination — search di kolom teks (nama, email, telepon, departemen).
  const table = useTableControls(rows, { searchFields: ['name', 'email', 'phone', 'department'] });

  function roleLabel(roleId: string) {
    return roles.find((r) => r.value === roleId)?.label || '-';
  }
  function roleIsAdmin(roleId: string) {
    return roles.find((r) => r.value === roleId)?.roleKey === 'admin';
  }
  function employmentTypeLabel(id: string) {
    return employmentTypes.find((e) => e.value === id)?.label || '-';
  }

  function handleExportCsv() {
    const header = ['Nama', 'Email', 'Role', 'Tipe Kepegawaian', 'Boleh Menugaskan', 'Status'];
    const lines = [
      header,
      ...rows.map((row) => [
        row.name,
        row.email,
        roleLabel(row.role_id),
        row.employment_type_id ? employmentTypeLabel(row.employment_type_id) : '',
        row.can_assign_others || 'Tidak',
        row.status,
      ]),
    ];
    downloadCsv(`master-users-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(lines));
  }

  function handleDownloadTemplate() {
    downloadCsv('template-master-users.csv', buildCsv([['name', 'email', 'role', 'employment_type', 'status']]));
  }

  function openImportPicker() {
    setImportResults(null);
    fileInputRef.current?.click();
  }

  /**
   * Import CSV Master User (Fase 7) — beda dari Import CSV Master Data generik: password TIDAK
   * pernah dibaca dari CSV (kolom password sengaja tidak ada di template). Server membuatkan
   * password acak untuk tiap user baru (`autoGeneratePassword: true`) dan mewajibkan mereka
   * ganti password itu saat login pertama (must_change_password). Password sementara hasil
   * generate ditampilkan SEKALI di tabel hasil import supaya admin bisa menyampaikannya ke user
   * yang bersangkutan secara manual (tidak ada layanan email di aplikasi ini).
   */
  async function handleImportFile(file: File) {
    const text = await file.text();
    const parsedRows = parseCsv(text);
    if (parsedRows.length < 2) {
      setImportResults([{ rowNumber: 0, title: '-', ok: false, message: 'File CSV kosong atau tidak punya baris data.' }]);
      return;
    }

    const [headerRow, ...dataRows] = parsedRows;
    const headerIndex = new Map(headerRow.map((h, i) => [h.trim().toLowerCase(), i]));

    setImporting(true);
    setImportProgress({ current: 0, total: dataRows.length });
    const results: ImportRowResult[] = [];

    for (let idx = 0; idx < dataRows.length; idx++) {
      const rawRow = dataRows[idx];
      const rowNumber = idx + 2;
      setImportProgress({ current: idx + 1, total: dataRows.length });
      if (rawRow.every((c) => c.trim() === '')) continue;

      const get = (col: string) => {
        const i = headerIndex.get(col);
        return i !== undefined ? (rawRow[i] ?? '').trim() : '';
      };

      const name = get('name');
      const email = get('email');
      const roleRaw = get('role');
      const employmentTypeRaw = get('employment_type');
      const statusRaw = get('status') || 'Active';
      const rowTitle = name || email || `(baris ${rowNumber})`;

      const role = roles.find(
        (r) => r.label.toLowerCase() === roleRaw.toLowerCase() || r.roleKey.toLowerCase() === roleRaw.toLowerCase()
      );
      if (roleRaw && !role) {
        results.push({ rowNumber, title: rowTitle, ok: false, message: `Role "${roleRaw}" tidak ditemukan.` });
        continue;
      }

      const employmentType = employmentTypeRaw
        ? employmentTypes.find((e) => e.label.toLowerCase() === employmentTypeRaw.toLowerCase())
        : undefined;
      if (employmentTypeRaw && !employmentType) {
        results.push({ rowNumber, title: rowTitle, ok: false, message: `Tipe Kepegawaian "${employmentTypeRaw}" tidak ditemukan.` });
        continue;
      }

      const payload = {
        name,
        email,
        role_id: role?.value || '',
        employment_type_id: employmentType?.value || '',
        status: statusRaw,
        autoGeneratePassword: true,
      };

      try {
        const res = await apiFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          const msg = json.fieldErrors ? Object.values(json.fieldErrors).join('; ') : json.error || 'Gagal menyimpan.';
          results.push({ rowNumber, title: rowTitle, ok: false, message: msg });
        } else {
          results.push({
            rowNumber,
            title: rowTitle,
            ok: true,
            message: `Berhasil. Password sementara: ${json.generatedPassword} — wajib diganti user saat login pertama.`,
          });
        }
      } catch {
        results.push({ rowNumber, title: rowTitle, ok: false, message: 'Terjadi kesalahan jaringan.' });
      }
    }

    setImportResults(results);
    setImporting(false);
    await load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4">
        <h1 className="text-lg font-semibold text-gray-900">Master Users</h1>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearchBox value={table.search} onChange={table.setSearch} placeholder="Cari nama, email, telepon..." />
          <button
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          {permissions.canCreate && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Template CSV
              </button>
              <button
                onClick={openImportPicker}
                disabled={importing}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {importing ? `Mengimpor... (${importProgress.current}/${importProgress.total})` : 'Import CSV'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleImportFile(file);
                }}
              />
              <button
                onClick={openCreateModal}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + Tambah User
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <SortableHeader label="Nama" active={table.sortKey === 'name'} dir={table.sortDir} onClick={() => table.toggleSort('name')} />
              <SortableHeader label="Email" active={table.sortKey === 'email'} dir={table.sortDir} onClick={() => table.toggleSort('email')} />
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Tipe Kepegawaian</th>
              <th className="px-4 py-2 font-medium">Boleh Menugaskan</th>
              <SortableHeader label="Status" active={table.sortKey === 'status'} dir={table.sortDir} onClick={() => table.toggleSort('status')} />
              <th className="px-4 py-2 font-medium">Aksi</th>
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
            {!loading && rows.length > 0 && table.paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Tidak ada data yang cocok dengan pencarian.
                </td>
              </tr>
            )}
            {!loading &&
              table.paged.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-gray-700">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700">
                        {(row.name || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span>{row.name}</span>
                    </div>
                    {row.must_change_password === 'Ya' && (
                      <span className="ml-11 mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">
                        Belum ganti password
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{row.email}</td>
                  <td className="px-4 py-2 text-gray-700">
                    <Badge label={roleLabel(row.role_id)} tone={roleIsAdmin(row.role_id) ? 'info' : 'neutral'} />
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {row.employment_type_id ? employmentTypeLabel(row.employment_type_id) : '-'}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{row.can_assign_others || 'Tidak'}</td>
                  <td className="px-4 py-2"><StatusBadge value={row.status} /></td>
                  <td className="px-4 py-2">
                    {permissions.canEdit && (
                      <button onClick={() => openEditModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                        Edit
                      </button>
                    )}
                    {permissions.canDelete && row.id !== currentUserId && (
                      <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                        Nonaktifkan
                      </button>
                    )}
                    {!permissions.canEdit && (!permissions.canDelete || row.id === currentUserId) && (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={table.page}
        totalPages={table.totalPages}
        totalCount={table.totalCount}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit User' : 'Tambah User'}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Nama *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Telepon</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Departemen</label>
                  <input
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Password {editingId ? '(kosongkan jika tidak ingin diubah)' : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Role *</label>
                <select
                  value={form.role_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, role_id: e.target.value, employment_type_id: '', can_assign_others: 'Tidak' }))
                  }
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors"
                >
                  <option value="">-- Pilih Role --</option>
                  {roleOptionsForForm.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                      {!r.active ? ' (Inactive)' : ''}
                    </option>
                  ))}
                </select>
                {fieldErrors.role_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.role_id}</p>}
              </div>

              {!isAdminRole && form.role_id && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipe Kepegawaian *</label>
                  <select
                    value={form.employment_type_id}
                    onChange={(e) => setForm((f) => ({ ...f, employment_type_id: e.target.value, can_assign_others: 'Tidak' }))}
                    className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors"
                  >
                    <option value="">-- Pilih Tipe Kepegawaian --</option>
                    {employmentTypeOptionsForForm.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                        {!e.active ? ' (Inactive)' : ''}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.employment_type_id && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.employment_type_id}</p>
                  )}
                </div>
              )}

              {showCanAssign && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Boleh Menugaskan ke User Lain *
                  </label>
                  <div className="flex gap-4">
                    {['Ya', 'Tidak'].map((opt) => (
                      <label key={opt} className="flex items-center gap-1.5 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="can_assign_others"
                          checked={form.can_assign_others === opt}
                          onChange={() => setForm((f) => ({ ...f, can_assign_others: opt }))}
                          className="text-indigo-600 focus-ring"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                  {fieldErrors.can_assign_others && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.can_assign_others}</p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Status *</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="focus-ring rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="focus-ring rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {importResults && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Hasil Import CSV</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <p className="mb-4 text-sm text-gray-500">
              {importResults.filter((r) => r.ok).length} berhasil, {importResults.filter((r) => !r.ok).length} gagal
              dari {importResults.length} baris. Catat password sementara di bawah sebelum menutup jendela ini —
              tidak ditampilkan lagi setelahnya.
            </p>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Baris</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importResults.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-500">{r.rowNumber || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{r.title}</td>
                      <td className={`px-3 py-2 ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setImportResults(null)}
                className="focus-ring rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Tutup
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
