'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { EntityConfig, FieldConfig } from '@/lib/master-data/config';
import { parseCsv, buildCsv, downloadCsv } from '@/lib/csv';
import { apiFetch } from '@/lib/csrf-client';

type Row = Record<string, string>;
type SelectOption = { value: string; label: string };
type Permissions = { canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean };
type ImportRowResult = { rowNumber: number; title: string; ok: boolean; message: string };
type DeleteBlockedState = { row: Row; message: string; reassignable: boolean };

export default function MasterDataTable({
  entityKey,
  config,
  permissions,
}: {
  entityKey: string;
  config: EntityConfig;
  permissions: Permissions;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [options, setOptions] = useState<Record<string, SelectOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState<ImportRowResult[] | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<DeleteBlockedState | null>(null);
  const [reassignToId, setReassignToId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rowsRes, optsRes] = await Promise.all([
        apiFetch(`/api/master/${entityKey}`),
        apiFetch(`/api/master/${entityKey}/options`),
      ]);
      const rowsJson = await rowsRes.json();
      const optsJson = await optsRes.json();
      if (!rowsRes.ok) throw new Error(rowsJson.error || 'Gagal memuat data.');
      setRows(rowsJson.data);
      setOptions(optsJson.data || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [entityKey]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreateModal() {
    setEditingRow(null);
    const defaults: Record<string, string> = {};
    config.fields.forEach((f) => {
      defaults[f.key] = f.type === 'boolean' ? 'Tidak' : '';
    });
    setFormValues(defaults);
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEditModal(row: Row) {
    setEditingRow(row);
    const values: Record<string, string> = {};
    config.fields.forEach((f) => {
      values[f.key] = row[f.key] ?? (f.type === 'boolean' ? 'Tidak' : '');
    });
    setFormValues(values);
    setFieldErrors({});
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const url = editingRow ? `/api/master/${entityKey}/${editingRow.id}` : `/api/master/${entityKey}`;
      const method = editingRow ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
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

  async function handleDelete(row: Row) {
    const title = row[config.titleField] || row.id;
    if (!confirm(`Hapus "${title}"? Data akan ditandai terhapus (soft-delete).`)) return;
    try {
      const res = await apiFetch(`/api/master/${entityKey}/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409 && json.reassignable) {
          setDeleteBlocked({ row, message: json.error, reassignable: true });
          setReassignToId('');
        } else {
          alert(json.error || 'Gagal menghapus data.');
        }
        return;
      }
      await load();
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  }

  async function handleReassignAndDelete() {
    if (!deleteBlocked || !reassignToId) return;
    setReassigning(true);
    try {
      const res = await apiFetch(`/api/master/${entityKey}/${deleteBlocked.row.id}/reassign-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_id: reassignToId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Gagal memindahkan & menghapus data.');
        return;
      }
      setDeleteBlocked(null);
      await load();
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setReassigning(false);
    }
  }

  function handleExportCsv() {
    const header = config.fields.map((f) => f.label);
    const lines = [header, ...rows.map((row) => config.fields.map((f) => csvCellValue(f, row[f.key], options[f.key])))];
    downloadCsv(`master-${entityKey}-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(lines));
  }

  function handleDownloadTemplate() {
    const header = config.fields.map((f) => f.key);
    downloadCsv(`template-master-${entityKey}.csv`, buildCsv([header]));
  }

  function openImportPicker() {
    setImportResults(null);
    fileInputRef.current?.click();
  }

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
      const rowNumber = idx + 2; // +1 header, +1 karena 1-indexed
      setImportProgress({ current: idx + 1, total: dataRows.length });

      if (rawRow.every((c) => c.trim() === '')) continue; // lewati baris kosong

      const payload: Record<string, string> = {};
      let rowError: string | null = null;

      for (const field of config.fields) {
        const colIdx = headerIndex.get(field.key.toLowerCase());
        const raw = colIdx !== undefined ? (rawRow[colIdx] ?? '').trim() : '';

        if (field.type === 'select') {
          if (!raw) {
            payload[field.key] = '';
            continue;
          }
          const opts = options[field.key] || [];
          const match = opts.find(
            (o) => o.label.toLowerCase() === raw.toLowerCase() || o.value.toLowerCase() === raw.toLowerCase()
          );
          if (!match) {
            rowError = `${field.label}: "${raw}" tidak ditemukan di ${field.optionsFrom ? 'data master terkait' : 'pilihan yang valid'}.`;
            break;
          }
          payload[field.key] = match.value;
        } else if (field.type === 'boolean') {
          const norm = raw.toLowerCase();
          payload[field.key] = ['ya', 'true', 'yes', '1'].includes(norm) ? 'Ya' : 'Tidak';
        } else {
          payload[field.key] = raw;
        }
      }

      const rowTitle = payload[config.titleField] || `(baris ${rowNumber})`;

      if (rowError) {
        results.push({ rowNumber, title: rowTitle, ok: false, message: rowError });
        continue;
      }

      try {
        const res = await apiFetch(`/api/master/${entityKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          const msg = json.fieldErrors ? Object.values(json.fieldErrors).join('; ') : json.error || 'Gagal menyimpan.';
          results.push({ rowNumber, title: rowTitle, ok: false, message: msg });
        } else {
          results.push({ rowNumber, title: rowTitle, ok: true, message: 'Berhasil ditambahkan.' });
        }
      } catch {
        results.push({ rowNumber, title: rowTitle, ok: false, message: 'Terjadi kesalahan jaringan.' });
      }
    }

    setImportResults(results);
    setImporting(false);
    await load();
  }

  const tableFields = config.fields.filter((f) => f.showInTable !== false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4">
        <h1 className="text-lg font-semibold text-gray-900">Master {config.labelPlural}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.canExport && (
            <button
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Export CSV
            </button>
          )}
          {permissions.canCreate && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Template CSV
              </button>
              <button
                onClick={openImportPicker}
                disabled={importing}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                + Tambah {config.label}
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
              {tableFields.map((f) => (
                <th key={f.key} className="px-4 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-4 py-6 text-center text-gray-400">
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-4 py-6 text-center text-gray-400">
                  Belum ada data.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => {
                const isSystemRow = !!(config.systemFlagField && row[config.systemFlagField] === 'Ya');
                return (
                  <tr key={row.id}>
                    {tableFields.map((f, idx) => (
                      <td key={f.key} className="px-4 py-2 text-gray-700">
                        {renderCellValue(f, row[f.key], options[f.key])}
                        {idx === 0 && isSystemRow && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                            Bawaan Sistem
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      {permissions.canEdit && (
                        <button onClick={() => openEditModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                          Edit
                        </button>
                      )}
                      {permissions.canDelete && !isSystemRow && (
                        <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                          Hapus
                        </button>
                      )}
                      {permissions.canDelete && isSystemRow && (
                        <span className="text-gray-300" title="Data bawaan sistem tidak bisa dihapus">
                          -
                        </span>
                      )}
                      {!permissions.canEdit && !permissions.canDelete && (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingRow ? `Edit ${config.label}` : `Tambah ${config.label}`}
            </h2>
            <form onSubmit={handleSave} className="space-y-3">
              {config.fields.map((f) => (
                <FieldInput
                  key={f.key}
                  field={f}
                  value={formValues[f.key] ?? ''}
                  error={fieldErrors[f.key]}
                  options={options[f.key]}
                  disabled={!!(f.lockOnEdit && editingRow)}
                  onChange={(v) => setFormValues((prev) => ({ ...prev, [f.key]: v }))}
                />
              ))}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importResults && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Hasil Import CSV</h2>
            <p className="mb-4 text-sm text-gray-500">
              {importResults.filter((r) => r.ok).length} berhasil, {importResults.filter((r) => !r.ok).length} gagal
              dari {importResults.length} baris.
            </p>
            <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200">
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
                      <td className={`px-3 py-2 ${r.ok ? 'text-green-700' : 'text-red-600'}`}>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setImportResults(null)}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteBlocked && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Tidak Bisa Dihapus Langsung</h2>
            <p className="mb-4 text-sm text-gray-600">{deleteBlocked.message}</p>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ganti dengan {config.label}</label>
            <select
              value={reassignToId}
              onChange={(e) => setReassignToId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            >
              <option value="">-- Pilih {config.label} pengganti --</option>
              {rows
                .filter((r) => r.id !== deleteBlocked.row.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r[config.titleField] || r.id}
                  </option>
                ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Semua data yang masih memakai &quot;{deleteBlocked.row[config.titleField]}&quot; akan dipindahkan ke
              pilihan di atas, baru kemudian &quot;{deleteBlocked.row[config.titleField]}&quot; dihapus.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteBlocked(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleReassignAndDelete}
                disabled={!reassignToId || reassigning}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {reassigning ? 'Memproses...' : 'Ganti & Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderCellValue(field: FieldConfig, value: string, fieldOptions?: SelectOption[]) {
  if (field.type === 'select' && fieldOptions) {
    const match = fieldOptions.find((o) => o.value === value);
    return match?.label || value || '-';
  }
  return value || '-';
}

/** Sama seperti renderCellValue, tapi untuk Export CSV: sel kosong tetap kosong (bukan "-"),
 * supaya file hasil export bisa langsung dipakai lagi untuk Import tanpa perlu diedit dulu. */
function csvCellValue(field: FieldConfig, value: string, fieldOptions?: SelectOption[]): string {
  if (field.type === 'select' && fieldOptions) {
    const match = fieldOptions.find((o) => o.value === value);
    return match?.label || value || '';
  }
  return value || '';
}

function FieldInput({
  field,
  value,
  error,
  options,
  disabled,
  onChange,
}: {
  field: FieldConfig;
  value: string;
  error?: string;
  options?: SelectOption[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
        {disabled && <span className="ml-1 text-xs font-normal text-gray-400">(tidak bisa diubah)</span>}
      </label>

      {field.type === 'select' && (
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
        >
          <option value="">-- Pilih --</option>
          {(options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === 'boolean' && (
        <div className="flex gap-4">
          {['Ya', 'Tidak'].map((opt) => (
            <label key={opt} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name={field.key}
                checked={value === opt}
                disabled={disabled}
                onChange={() => onChange(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {field.type === 'textarea' && (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
        />
      )}

      {(field.type === 'text' || field.type === 'email' || field.type === 'number' || field.type === 'date') && (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
        />
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
