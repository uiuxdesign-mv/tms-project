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
  photo_url?: string;
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

/** Avatar bundar — pakai foto asli (proxy lewat /api/users/[id]/photo) kalau ada, fallback huruf awal nama. */
function UserAvatar({ userId, name, photoUrl, size = 8 }: { userId: string; name: string; photoUrl?: string; size?: 8 | 10 }) {
  const dim = size === 10 ? 'h-10 w-10' : 'h-8 w-8';
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/users/${userId}/photo`} alt={name} className={`${dim} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700`}>
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [viewingRow, setViewingRow] = useState<UserRow | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
    setPhotoFile(null);
    setPhotoPreview(null);
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
    setPhotoFile(null);
    setPhotoPreview(row.photo_url ? `/api/users/${row.id}/photo` : null);
    setModalOpen(true);
  }

  function openDetailModal(row: UserRow) {
    setViewingRow(row);
  }

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    if (file) setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const url = editingId ? `/api/users/${editingId}` : '/api/users';
      const method = editingId ? 'PATCH' : 'POST';

      // Selalu kirim sebagai FormData (Fase 11) — supaya foto ikut terkirim kalau dipilih,
      // sekaligus tetap kompatibel untuk kasus tanpa foto (field `photo` cukup tidak disertakan).
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === 'password' && editingId && !value) return; // biarkan password lama kalau tidak diisi
        formData.append(key, value);
      });
      if (photoFile) formData.append('photo', photoFile);

      const res = await apiFetch(url, { method, body: formData });
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
    const ok = await confirmDialog({ message: `Delete user "${row.name}"?`, confirmLabel: 'Delete', danger: true });
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
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Master User</h1>
          <p className="text-sm text-gray-500">{rows.length} total users</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                onClick={openImportPicker}
                disabled={importing}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {importing ? `Importing... (${importProgress.current}/${importProgress.total})` : 'Import CSV'}
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
                + Add User
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 p-4">
          <TableSearchBox value={table.search} onChange={table.setSearch} placeholder="Search name, email, department..." />
        </div>

        {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <SortableHeader label="Name" active={table.sortKey === 'name'} dir={table.sortDir} onClick={() => table.toggleSort('name')} />
                <SortableHeader label="Email" active={table.sortKey === 'email'} dir={table.sortDir} onClick={() => table.toggleSort('email')} />
                <SortableHeader label="Department" active={table.sortKey === 'department'} dir={table.sortDir} onClick={() => table.toggleSort('department')} />
                <th className="px-4 py-2 font-medium">Role</th>
                <SortableHeader label="Status" active={table.sortKey === 'status'} dir={table.sortDir} onClick={() => table.toggleSort('status')} />
                <th className="px-4 py-2 font-medium">Actions</th>
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
              {!loading && rows.length > 0 && table.paged.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Tidak ada data yang cocok dengan pencarian.
                  </td>
                </tr>
              )}
              {!loading &&
                table.paged.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 text-gray-700">
                      <div className="flex items-center gap-3">
                        <UserAvatar userId={row.id} name={row.name} photoUrl={row.photo_url} />
                        <span>{row.name}</span>
                      </div>
                      {row.must_change_password === 'Ya' && (
                        <span className="ml-11 mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">
                          Belum ganti password
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{row.email}</td>
                    <td className="px-4 py-2 text-gray-500">{row.department || '-'}</td>
                    <td className="px-4 py-2 text-gray-700">
                      <Badge label={roleLabel(row.role_id)} tone={roleIsAdmin(row.role_id) ? 'info' : 'neutral'} />
                    </td>
                    <td className="px-4 py-2"><StatusBadge value={row.status} /></td>
                    <td className="px-4 py-2">
                      <button onClick={() => openDetailModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                        Detail
                      </button>
                      {permissions.canEdit && (
                        <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                          Edit
                        </button>
                      )}
                      {permissions.canDelete && row.id !== currentUserId && (
                        <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                          Delete
                        </button>
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
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit User' : 'Add User'}</h2>
            </div>
            {/* Bugfix (Fase 14): tombol aksi (Cancel/Save) dipindah ke footer `shrink-0` di luar
                area scroll — sebelumnya ikut di dalam `overflow-y-auto`, jadi tombolnya ikut
                ter-scroll ke bawah dan hilang dari layar kalau field form-nya banyak/panjang. */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Full Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Department</label>
                <input
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Photo</label>
                <div className="flex items-center gap-3">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="Preview" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </span>
                  )}
                  <div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
                      className="block text-sm text-gray-700 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-1.5 file:text-sm file:text-gray-700 hover:file:bg-gray-100"
                    />
                    <p className="mt-1 text-xs text-gray-400">JPG, PNG, or WEBP. Max 2MB.</p>
                  </div>
                </div>
                {fieldErrors.photo && <p className="mt-1 text-xs text-red-600">{fieldErrors.photo}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Role *</label>
                  <select
                    value={form.role_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role_id: e.target.value, employment_type_id: '', can_assign_others: 'Tidak' }))
                    }
                    className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors"
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

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Status *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {!isAdminRole && form.role_id && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Employment Type *</label>
                  <select
                    value={form.employment_type_id}
                    onChange={(e) => setForm((f) => ({ ...f, employment_type_id: e.target.value, can_assign_others: 'Tidak' }))}
                    className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors"
                  >
                    <option value="">-- Select an employment type... --</option>
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
                    Is this user allowed to assign tasks to other users?
                  </label>
                  <div className="flex gap-4">
                    {(['Ya', 'Tidak'] as const).map((opt) => (
                      <label key={opt} className="flex items-center gap-1.5 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="can_assign_others"
                          checked={form.can_assign_others === opt}
                          onChange={() => setForm((f) => ({ ...f, can_assign_others: opt }))}
                          className="text-indigo-600 focus-ring"
                        />
                        {opt === 'Ya' ? 'Yes' : 'No'}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    If &quot;Yes&quot;, this user can assign tasks to other users besides themselves on the Add/Edit Task
                    page. If &quot;No&quot;, this user can only assign tasks to themselves.
                  </p>
                  {fieldErrors.can_assign_others && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.can_assign_others}</p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Password {editingId ? '(leave blank to keep unchanged)' : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
              </div>
            </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="focus-ring rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="focus-ring rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create User'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}

      {viewingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">User Detail</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex items-center gap-3">
                <UserAvatar userId={viewingRow.id} name={viewingRow.name} photoUrl={viewingRow.photo_url} size={10} />
                <div>
                  <p className="font-medium text-gray-900">{viewingRow.name}</p>
                  <p className="text-sm text-gray-500">{viewingRow.email}</p>
                </div>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="text-right text-gray-900">{viewingRow.phone || '-'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Department</dt>
                  <dd className="text-right text-gray-900">{viewingRow.department || '-'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Role</dt>
                  <dd className="text-right text-gray-900">{roleLabel(viewingRow.role_id)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Employment Type</dt>
                  <dd className="text-right text-gray-900">
                    {viewingRow.employment_type_id ? employmentTypeLabel(viewingRow.employment_type_id) : '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Status</dt>
                  <dd className="text-right"><StatusBadge value={viewingRow.status} /></dd>
                </div>
              </dl>
            </div>
            <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-4">
              <button
                onClick={() => setViewingRow(null)}
                className="focus-ring rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {importResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
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
            </div>
            <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-4">
              <button
                onClick={() => setImportResults(null)}
                className="focus-ring rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
