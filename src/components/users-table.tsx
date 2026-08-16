'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { parseCsv, buildCsv, downloadCsv } from '@/lib/csv';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useTableControls } from '@/lib/hooks/use-table-controls';
import { SortableHeader, TableSearchBox, PaginationBar } from '@/components/table-controls';
import { Badge, StatusBadge } from '@/components/badge';
import AvatarEditor from '@/components/avatar-editor';
import { useLanguage } from '@/components/language-provider';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';

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

type RoleOption = { value: string; label: string; roleKey: string; isAdminEquivalent: boolean; active: boolean };
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

/**
 * Avatar bundar — pakai foto asli (proxy lewat /api/users/[id]/photo) kalau ada, fallback huruf
 * awal nama.
 * Bugfix (Fase 18, permintaan user): `photoUrl` di sini sebenarnya adalah Drive file ID kolom
 * `photo_url` (BUKAN url sungguhan) — sebelumnya cuma dipakai sebagai pengecekan ada/tidaknya foto,
 * padahal URL proxy-nya (`/api/users/{id}/photo`) SELALU SAMA persis setiap kali dipanggil, walau
 * foto sudah diganti. Karena endpoint proxy itu dikirim dengan header cache 1 jam, browser jadi
 * terus menampilkan foto LAMA dari cache-nya sendiri walau server sudah menyimpan foto baru hasil
 * crop — persis gejala yang dilaporkan user ("foto tersimpan tidak sesuai yang di-crop"). Fix:
 * sertakan Drive file ID sebagai query string `?v=` — karena ID ini SELALU berubah tiap upload foto
 * baru (lihat uploadUserPhoto), URL jadi otomatis "versi baru" tiap ganti foto, sehingga browser
 * dipaksa fetch ulang alih-alih pakai cache lama.
 */
function UserAvatar({ userId, name, photoUrl, size = 8 }: { userId: string; name: string; photoUrl?: string; size?: 8 | 10 }) {
  const dim = size === 10 ? 'h-10 w-10' : 'h-8 w-8';
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/users/${userId}/photo?v=${encodeURIComponent(photoUrl)}`}
        alt={name}
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
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
  const { t } = useLanguage();
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
  const [removePhoto, setRemovePhoto] = useState(false);
  const [viewingRow, setViewingRow] = useState<UserRow | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState<ImportRowResult[] | null>(null);

  // Perbaikan (permintaan user): layer utama di belakang modal tidak boleh ikut ke-scroll selama
  // salah satu dari 3 modal di komponen ini terbuka (Tambah/Edit, Detail, Hasil Impor).
  useBodyScrollLock(modalOpen || !!viewingRow || !!importResults);

  // Bugfix (permintaan user, item loading-flicker): sama seperti komponen Task/Master Data —
  // reload setelah aksi Tambah/Edit/Import (`silent: true`) tidak lagi mengganti baris tabel
  // dengan "Memuat..." sesaat.
  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [usersRes, optsRes] = await Promise.all([apiFetch('/api/users'), apiFetch('/api/users/options')]);
      const usersJson = await parseJsonSafe(usersRes);
      const optsJson = await parseJsonSafe(optsRes);
      if (!usersRes.ok || !usersJson.data) throw new Error(usersJson.error || t('toast_load_data_failed'));
      if (!optsRes.ok || !optsJson.data) throw new Error(optsJson.error || t('toast_load_options_failed'));
      setRows(usersJson.data);
      setRoles(optsJson.data.roles);
      setEmploymentTypes(optsJson.data.employmentTypes);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_load_data_failed'));
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRole = roles.find((r) => r.value === form.role_id);
  // Perbaikan (permintaan user): mencakup role_key bawaan sistem 'admin' MAUPUN role lain yang
  // ditandai "Is Admin" di Master Role — bukan cuma role bawaan sistem lagi.
  const isAdminRole = !!selectedRole?.isAdminEquivalent;
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
    setRemovePhoto(false);
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
    // Bugfix (Fase 18): sertakan `?v=` (Drive file ID) — lihat catatan di UserAvatar.
    setPhotoPreview(row.photo_url ? `/api/users/${row.id}/photo?v=${encodeURIComponent(row.photo_url)}` : null);
    setRemovePhoto(false);
    setModalOpen(true);
  }

  function openDetailModal(row: UserRow) {
    setViewingRow(row);
  }

  function handlePhotoReady(file: File, previewUrl: string) {
    setPhotoFile(file);
    setPhotoPreview(previewUrl);
    setRemovePhoto(false);
  }

  function handlePhotoRemove() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
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
      else if (removePhoto && editingId) formData.append('remove_photo', '1');

      const res = await apiFetch(url, { method, body: formData });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else toast.error(json.error || t('toast_save_task_failed'));
        return;
      }
      setModalOpen(false);
      await load({ silent: true });
      toast.success(editingId ? t('toast_user_updated') : t('toast_user_created'));
    } catch {
      toast.error(t('toast_network_error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: UserRow) {
    const ok = await confirmDialog({ message: `${t('confirm_delete_generic_prefix')} ${t('u_entity_word')} "${row.name}"?`, confirmLabel: t('action_delete'), danger: true });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/users/${row.id}`, { method: 'DELETE' });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        toast.error(json.error || t('toast_delete_data_failed'));
        return;
      }
      await load({ silent: true });
      toast.success(`${t('u_entity_word')} "${row.name}" ${t('toast_task_deleted_suffix')}`);
    } catch {
      toast.error(t('toast_network_error'));
    }
  }

  // Fase 10: search/sort/pagination — search di kolom teks (nama, email, telepon, departemen).
  const table = useTableControls(rows, { searchFields: ['name', 'email', 'phone', 'department'] });

  function roleLabel(roleId: string) {
    return roles.find((r) => r.value === roleId)?.label || '-';
  }
  function roleIsAdmin(roleId: string) {
    return !!roles.find((r) => r.value === roleId)?.isAdminEquivalent;
  }
  function employmentTypeLabel(id: string) {
    return employmentTypes.find((e) => e.value === id)?.label || '-';
  }

  function handleExportCsv() {
    const header = [t('md_col_name'), t('u_col_email'), t('u_col_role'), t('u_col_employment_type'), t('u_col_can_assign'), t('col_status')];
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
      setImportResults([{ rowNumber: 0, title: '-', ok: false, message: t('md_import_empty_csv') }]);
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
      const rowTitle = name || email || `(${t('md_import_row_label')} ${rowNumber})`;

      const role = roles.find(
        (r) => r.label.toLowerCase() === roleRaw.toLowerCase() || r.roleKey.toLowerCase() === roleRaw.toLowerCase()
      );
      if (roleRaw && !role) {
        results.push({ rowNumber, title: rowTitle, ok: false, message: `${t('u_col_role')} "${roleRaw}" ${t('u_import_not_found_suffix')}` });
        continue;
      }

      const employmentType = employmentTypeRaw
        ? employmentTypes.find((e) => e.label.toLowerCase() === employmentTypeRaw.toLowerCase())
        : undefined;
      if (employmentTypeRaw && !employmentType) {
        results.push({ rowNumber, title: rowTitle, ok: false, message: `${t('u_col_employment_type')} "${employmentTypeRaw}" ${t('u_import_not_found_suffix')}` });
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
        const json = await parseJsonSafe(res);
        if (!res.ok) {
          const msg = json.fieldErrors ? Object.values(json.fieldErrors).join('; ') : json.error || t('md_import_save_failed');
          results.push({ rowNumber, title: rowTitle, ok: false, message: msg });
        } else {
          results.push({
            rowNumber,
            title: rowTitle,
            ok: true,
            message: `${t('u_import_success_prefix')} ${json.generatedPassword} ${t('u_import_success_suffix')}`,
          });
        }
      } catch {
        results.push({ rowNumber, title: rowTitle, ok: false, message: t('toast_network_error') });
      }
    }

    setImportResults(results);
    setImporting(false);
    await load({ silent: true });
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    if (failCount === 0) toast.success(t('toast_import_users_done_success').replace('{ok}', String(okCount)));
    else toast.error(t('toast_import_done_mixed').replace('{ok}', String(okCount)).replace('{fail}', String(failCount)));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('users_page_title')}</h1>
          <p className="text-sm text-gray-500">{t('u_subtitle').replace('{count}', String(rows.length))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('md_export_csv')}
          </button>
          {permissions.canCreate && (
            <>
              <button
                onClick={openImportPicker}
                disabled={importing}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {importing ? `${t('md_importing')} (${importProgress.current}/${importProgress.total})` : t('md_import_csv')}
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
                {t('users_add_button')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 p-4">
          <TableSearchBox value={table.search} onChange={table.setSearch} placeholder={t('u_search_placeholder')} />
        </div>

        {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <SortableHeader label={t('md_col_name')} active={table.sortKey === 'name'} dir={table.sortDir} onClick={() => table.toggleSort('name')} />
                <SortableHeader label={t('u_col_email')} active={table.sortKey === 'email'} dir={table.sortDir} onClick={() => table.toggleSort('email')} />
                <SortableHeader label={t('u_col_department')} active={table.sortKey === 'department'} dir={table.sortDir} onClick={() => table.toggleSort('department')} />
                <th className="px-4 py-2 font-medium">{t('u_col_role')}</th>
                <SortableHeader label={t('col_status')} active={table.sortKey === 'status'} dir={table.sortDir} onClick={() => table.toggleSort('status')} />
                <th className="px-4 py-2 font-medium">{t('col_actions')}</th>
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
              {!loading && rows.length > 0 && table.paged.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    {t('md_no_match')}
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
                        <span className="ml-11 mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-medium uppercase text-amber-700">
                          {t('u_must_change_password_badge')}
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
                        {t('action_detail')}
                      </button>
                      {permissions.canEdit && (
                        <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                          {t('action_edit')}
                        </button>
                      )}
                      {permissions.canDelete && row.id !== currentUserId && (
                        <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                          {t('action_delete')}
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
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? t('u_modal_edit_title') : t('u_modal_add_title')}</h2>
            </div>
            {/* Bugfix (Fase 14): tombol aksi (Cancel/Save) dipindah ke footer `shrink-0` di luar
                area scroll — sebelumnya ikut di dalam `overflow-y-auto`, jadi tombolnya ikut
                ter-scroll ke bawah dan hilang dari layar kalau field form-nya banyak/panjang. */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('u_field_full_name')}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('u_ph_full_name')}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('u_field_email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder={t('u_ph_email')}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
                {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('u_field_phone')}</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder={t('u_ph_phone')}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('u_col_department')}</label>
                <input
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  placeholder={t('u_ph_department')}
                  className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                />
              </div>

              <AvatarEditor
                label={t('u_field_photo')}
                previewUrl={photoPreview}
                onFileReady={handlePhotoReady}
                onRemove={handlePhotoRemove}
                canRemove={!!photoPreview}
                error={fieldErrors.photo}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('u_field_role')}</label>
                  <select
                    value={form.role_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role_id: e.target.value, employment_type_id: '', can_assign_others: 'Tidak' }))
                    }
                    className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors"
                  >
                    <option value="">{t('u_option_choose_role')}</option>
                    {roleOptionsForForm.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                        {!r.active ? ` (${t('status_inactive_label')})` : ''}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.role_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.role_id}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('u_field_status')}</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors"
                  >
                    <option value="Active">{t('status_active_label')}</option>
                    <option value="Inactive">{t('status_inactive_label')}</option>
                  </select>
                </div>
              </div>

              {!isAdminRole && form.role_id && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('u_field_employment_type')}</label>
                  <select
                    value={form.employment_type_id}
                    onChange={(e) => setForm((f) => ({ ...f, employment_type_id: e.target.value, can_assign_others: 'Tidak' }))}
                    className="select-field focus-ring w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors"
                  >
                    <option value="">{t('u_option_choose_employment_type')}</option>
                    {employmentTypeOptionsForForm.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                        {!e.active ? ` (${t('status_inactive_label')})` : ''}
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
                    {t('u_field_can_assign_question')}
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
                        {opt === 'Ya' ? t('dashboard_yes') : t('dashboard_no')}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {t('u_can_assign_help')}
                  </p>
                  {fieldErrors.can_assign_others && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.can_assign_others}</p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t('u_field_password')} {editingId ? t('u_password_keep_note') : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editingId ? t('u_ph_password_edit') : t('u_ph_password_new')}
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
                {t('action_cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="focus-ring rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? t('common_saving') : editingId ? t('form_save_changes') : t('u_save_create_btn')}
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
              <h2 className="text-lg font-semibold text-gray-900">{t('u_detail_title')}</h2>
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
                  <dt className="text-gray-500">{t('u_field_phone')}</dt>
                  <dd className="text-right text-gray-900">{viewingRow.phone || '-'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('u_col_department')}</dt>
                  <dd className="text-right text-gray-900">{viewingRow.department || '-'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('u_col_role')}</dt>
                  <dd className="text-right text-gray-900">{roleLabel(viewingRow.role_id)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('u_col_employment_type')}</dt>
                  <dd className="text-right text-gray-900">
                    {viewingRow.employment_type_id ? employmentTypeLabel(viewingRow.employment_type_id) : '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('col_status')}</dt>
                  <dd className="text-right"><StatusBadge value={viewingRow.status} /></dd>
                </div>
              </dl>
            </div>
            <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-4">
              <button
                onClick={() => setViewingRow(null)}
                className="focus-ring rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
              >
                {t('td_close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {importResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('md_import_result_title')}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <p className="mb-4 text-sm text-gray-500">
              {importResults.filter((r) => r.ok).length} {t('md_import_result_success')}, {importResults.filter((r) => !r.ok).length} {t('md_import_result_failed')}
              {' '}{t('md_import_result_from')} {importResults.length} {t('md_import_result_rows')} {t('u_import_note')}
            </p>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('md_import_col_row')}</th>
                    <th className="px-3 py-2 font-medium">{t('md_import_col_data')}</th>
                    <th className="px-3 py-2 font-medium">{t('md_import_col_note')}</th>
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
                {t('td_close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
