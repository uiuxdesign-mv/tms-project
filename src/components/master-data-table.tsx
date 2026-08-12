'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { EntityConfig, FieldConfig } from '@/lib/master-data/config';
import { parseCsv, buildCsv, downloadCsv } from '@/lib/csv';
import { apiFetch } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useTableControls } from '@/lib/hooks/use-table-controls';
import { SortableHeader, TableSearchBox, PaginationBar } from '@/components/table-controls';
import { Badge, StatusBadge } from '@/components/badge';

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
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [options, setOptions] = useState<Record<string, SelectOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [viewingRow, setViewingRow] = useState<Row | null>(null);
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
  // Fase 15: tombol naik/turun urutan di tabel Master Status (lihat handleMoveStatus).
  const [reorderingStatus, setReorderingStatus] = useState(false);

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

  // Bugfix (Fase 13): cek status aktif satu baris, generik untuk semua entity Master Data — semua
  // entity pakai kolom `status` bernilai 'Active'/'Inactive', KECUALI `statuses` yang justru punya
  // field bernama "status" sendiri (nama status task, mis. "To Do") dan menandai aktif/nonaktifnya
  // lewat kolom terpisah `is_active` ('Ya'/'Tidak') — lihat STATUS_FIELD vs field `is_active` di
  // lib/master-data/config.ts.
  function isRowActive(row: Row): boolean {
    if (entityKey === 'statuses') return row.is_active === 'Ya';
    return row.status === 'Active';
  }

  function openCreateModal() {
    setEditingRow(null);
    const defaults: Record<string, string> = {};
    config.fields.forEach((f) => {
      if (f.type !== 'boolean') {
        defaults[f.key] = '';
        return;
      }
      // Boolean displayAs:'select' (mis. Status Active/Inactive) default ke "Ya" (opsi pertama)
      // supaya data baru langsung usable; checkbox/radio biasa default ke "Tidak" (unchecked).
      defaults[f.key] = f.displayAs === 'select' ? 'Ya' : 'Tidak';
    });
    setFormValues(defaults);
    setFieldErrors({});
    setModalOpen(true);
  }

  // Ambil nilai SEMUA field config dari satu baris (dengan fallback default per tipe) — dipakai
  // baik untuk mengisi form Edit maupun untuk membangun payload PATCH "diam-diam" di
  // handleMoveStatus (naik/turun urutan Master Status) yang tidak melalui form sama sekali. Field
  // `hiddenInForm` (mis. sort_order) TETAP disertakan di sini supaya nilainya tidak hilang/ke-reset
  // saat form di-submit untuk mengubah field lain.
  function fullFieldPayload(row: Row): Record<string, string> {
    const values: Record<string, string> = {};
    config.fields.forEach((f) => {
      values[f.key] = row[f.key] ?? (f.type === 'boolean' ? 'Tidak' : '');
    });
    return values;
  }

  function openEditModal(row: Row) {
    setEditingRow(row);
    setFormValues(fullFieldPayload(row));
    setFieldErrors({});
    setModalOpen(true);
  }

  function openDetailModal(row: Row) {
    setViewingRow(row);
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
    const ok = await confirmDialog({
      message: `Delete ${config.label.toLowerCase()} "${title}"?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/master/${entityKey}/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409 && json.reassignable) {
          setDeleteBlocked({ row, message: json.error, reassignable: true });
          setReassignToId('');
        } else {
          toast.error(json.error || 'Gagal menghapus data.');
        }
        return;
      }
      await load();
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
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
        toast.error(json.error || 'Gagal memindahkan & menghapus data.');
        return;
      }
      setDeleteBlocked(null);
      await load();
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
    } finally {
      setReassigning(false);
    }
  }

  // Fase 15: tombol naik/turun urutan (kolom "Kanban Order" khusus Master Status) — menukar nilai
  // sort_order antara baris ini dan tetangganya (dicari dari urutan sort_order SEBENARNYA di
  // `rows`, bukan dari urutan tampilan tabel saat ini yang bisa saja sedang di-sort/di-filter
  // kolom lain). Mengirim SELURUH field baris lewat fullFieldPayload() -- bukan cuma
  // `{ sort_order }` -- karena PATCH generik di server tidak menerima partial update: field yang
  // tidak disertakan di body akan dianggap kosong dan menimpa nilai lama (lihat validateEntityPayload).
  //
  // Fase 16 (bugfix, sesuai laporan user): sort_order ("Urutan"/Kanban Order di tabel) TERNYATA
  // bukan field yang dipakai Kanban board, Rule B transisi status, maupun Time Tracking — semua itu
  // membaca workflow_level ("Urutan Workflow"). Kedua field ini di-seed sejajar (1,2,3,4,—) sehingga
  // dulu terlihat "sama", tapi menukar sort_order saja TIDAK mengubah urutan kolom Kanban sama
  // sekali. Perbaikan: saat kedua baris yang ditukar sama-sama punya workflow_level terisi, tukar
  // JUGA workflow_level-nya bareng sort_order (supaya kedua field tetap sejajar/konsisten ke
  // depannya). Kalau salah satu baris workflow_level-nya kosong (mis. "Cancelled", yang memang
  // sengaja dikecualikan dari alur linear), workflow_level TIDAK disentuh — cuma sort_order yang
  // ditukar, seperti semula.
  async function handleMoveStatus(row: Row, direction: 'up' | 'down') {
    const kanbanSorted = [...rows].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    const idx = kanbanSorted.findIndex((r) => r.id === row.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= kanbanSorted.length) return;
    const other = kanbanSorted[swapIdx];

    const bothHaveWorkflowLevel = (row.workflow_level ?? '') !== '' && (other.workflow_level ?? '') !== '';
    const rowPayload: Record<string, string> = { ...fullFieldPayload(row), sort_order: other.sort_order };
    const otherPayload: Record<string, string> = { ...fullFieldPayload(other), sort_order: row.sort_order };
    if (bothHaveWorkflowLevel) {
      rowPayload.workflow_level = other.workflow_level;
      otherPayload.workflow_level = row.workflow_level;
    }

    setReorderingStatus(true);
    try {
      const res1 = await apiFetch(`/api/master/${entityKey}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowPayload),
      });
      const json1 = await res1.json();
      if (!res1.ok) throw new Error(json1.error || 'Gagal mengubah urutan.');

      const res2 = await apiFetch(`/api/master/${entityKey}/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otherPayload),
      });
      const json2 = await res2.json();
      if (!res2.ok) throw new Error(json2.error || 'Gagal mengubah urutan.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah urutan.');
    } finally {
      // Selalu reload, sukses ataupun gagal di tengah jalan — supaya tabel selalu mencerminkan
      // urutan yang SEBENARNYA tersimpan di server, bukan asumsi optimistik di client.
      await load();
      setReorderingStatus(false);
    }
  }

  function handleExportCsv() {
    const header = config.fields.map((f) => f.label);
    const lines = [header, ...rows.map((row) => config.fields.map((f) => csvCellValue(f, row[f.key], options[f.key])))];
    downloadCsv(`master-${entityKey}-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(lines));
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

  // Fase 15: tabel Master Status pakai tampilan kustom (kolom Kanban Order + tombol naik/turun,
  // warna & Workflow Level & Markers ditampilkan, sesuai contoh gambar dari user) — bukan tabel
  // generik berbasis `tableFields` seperti 6 entity Master Data lainnya. Lihat render kondisional
  // di bawah (`isStatusesTable`).
  const isStatusesTable = entityKey === 'statuses';

  // Urutan Kanban SEBENARNYA (naik berdasarkan sort_order numerik) — dipakai sebagai urutan
  // TAMPILAN DEFAULT tabel Status (bukan urutan mentah dari sheet, yang bisa saja tidak lagi
  // selaras dengan sort_order setelah beberapa kali tukar-urutan lewat tombol naik/turun — lihat
  // handleMoveStatus, yang menukar NILAI sort_order, bukan posisi fisik baris di sheet), sekaligus
  // dipakai untuk menentukan apakah tombol naik/turun suatu baris harus dinonaktifkan (baris
  // pertama/terakhir).
  const kanbanSorted = isStatusesTable
    ? [...rows].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    : rows;

  // Fase 10: search/sort/pagination — search dibatasi ke kolom teks (text/email/textarea) supaya
  // tidak mencocokkan ID mentah dari kolom select yang tidak berarti apa-apa bagi user.
  const searchFields = tableFields
    .filter((f) => f.type === 'text' || f.type === 'email' || f.type === 'textarea')
    .map((f) => f.key);
  const table = useTableControls(kanbanSorted, {
    searchFields: searchFields.length > 0 ? searchFields : [config.titleField],
  });

  const subtitle = config.subtitleTemplate.replace('{count}', String(rows.length));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{config.pageTitle}</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.canExport && (
            <button
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Export CSV
            </button>
          )}
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
                + Add {config.label}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 p-4">
          <TableSearchBox value={table.search} onChange={table.setSearch} placeholder={`Search ${config.labelPlural.toLowerCase()}...`} />
        </div>

        {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
        {isStatusesTable ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <SortableHeader
                  label="Kanban Order"
                  active={table.sortKey === 'sort_order'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('sort_order')}
                />
                <SortableHeader
                  label="Name"
                  active={table.sortKey === 'status_name'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('status_name')}
                />
                <SortableHeader
                  label="Workflow Level"
                  active={table.sortKey === 'workflow_level'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('workflow_level')}
                />
                <th className="px-4 py-2 font-medium">Markers</th>
                <SortableHeader
                  label="Status"
                  active={table.sortKey === 'is_active'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('is_active')}
                />
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
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Belum ada data.
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
                table.paged.map((row) => {
                  const kanbanIdx = kanbanSorted.findIndex((r) => r.id === row.id);
                  const isFirst = kanbanIdx <= 0;
                  const isLast = kanbanIdx === -1 || kanbanIdx === kanbanSorted.length - 1;
                  const validColor = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(row.color_code) ? row.color_code : '#9ca3af';
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => handleMoveStatus(row, 'up')}
                              disabled={reorderingStatus || isFirst}
                              aria-label={`Naikkan urutan ${row.status_name}`}
                              className="text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStatus(row, 'down')}
                              disabled={reorderingStatus || isLast}
                              aria-label={`Turunkan urutan ${row.status_name}`}
                              className="text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                          </div>
                          <span className="text-gray-700">{row.sort_order || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2 font-medium text-gray-900">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200"
                            style={{ backgroundColor: validColor }}
                          />
                          {row.status_name}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{row.workflow_level || '—'}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {row.is_default === 'Ya' && <Badge label="Default" tone="info" />}
                          {row.is_final === 'Ya' && <Badge label="Final" tone="success" />}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge value={row.is_active === 'Ya' ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => openDetailModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                          Detail
                        </button>
                        {permissions.canEdit && (
                          <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                            Edit
                          </button>
                        )}
                        {permissions.canDelete && (
                          <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {tableFields.map((f) => (
                <SortableHeader
                  key={f.key}
                  label={f.label}
                  active={table.sortKey === f.key}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort(f.key)}
                />
              ))}
              <th className="px-4 py-2 font-medium">Actions</th>
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
            {!loading && rows.length > 0 && table.paged.length === 0 && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-4 py-6 text-center text-gray-400">
                  Tidak ada data yang cocok dengan pencarian.
                </td>
              </tr>
            )}
            {!loading &&
              table.paged.map((row) => {
                const isSystemRow = !!(config.systemFlagField && row[config.systemFlagField] === 'Ya');
                return (
                  <tr key={row.id}>
                    {tableFields.map((f, idx) => (
                      <td key={f.key} className="px-4 py-2 text-gray-700">
                        {renderCellForTable(f, row[f.key], options[f.key])}
                        {idx === 0 && isSystemRow && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                            Bawaan Sistem
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <button onClick={() => openDetailModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                        Detail
                      </button>
                      {permissions.canEdit && (
                        <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                          Edit
                        </button>
                      )}
                      {permissions.canDelete && !isSystemRow && (
                        <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                          Delete
                        </button>
                      )}
                      {permissions.canDelete && isSystemRow && (
                        <span className="text-gray-300" title="Data bawaan sistem tidak bisa dihapus">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        )}
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
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRow ? `Edit ${config.label}` : `Add ${config.label}`}
              </h2>
            </div>
            {/* Bugfix (Fase 14): tombol aksi (Cancel/Save) dipindah ke footer `shrink-0` di luar
                area scroll — sebelumnya ikut di dalam `overflow-y-auto`, jadi tombolnya ikut
                ter-scroll ke bawah dan hilang dari layar kalau field form-nya banyak/panjang. */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto p-5">
                <div className="space-y-3">
                  {/* Fase 15: field `hiddenInForm` (mis. sort_order Master Status) sengaja tidak
                      dirender di form Tambah MAUPUN Edit — nilainya tetap ada & tetap ikut
                      terkirim lewat formValues (lihat fullFieldPayload/openEditModal di atas),
                      cuma tidak bisa diketik manual di sini. */}
                  {config.fields.filter((f) => !f.hiddenInForm).map((f) => (
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
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingRow ? 'Save Changes' : `Create ${config.label}`}
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
              <h2 className="text-lg font-semibold text-gray-900">{config.label} Detail</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <dl className="space-y-3 text-sm">
                {config.fields.map((f) => (
                  <div key={f.key} className="flex justify-between gap-4">
                    <dt className="text-gray-500">{f.label}</dt>
                    <dd className="text-right text-gray-900">{renderCellForTable(f, viewingRow[f.key], options[f.key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-4">
              <button
                onClick={() => setViewingRow(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
              <p className="mt-1 text-sm text-gray-500">
                {importResults.filter((r) => r.ok).length} berhasil, {importResults.filter((r) => !r.ok).length} gagal
                dari {importResults.length} baris.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
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
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Tidak Bisa Dihapus Langsung</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="mb-4 text-sm text-gray-600">{deleteBlocked.message}</p>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Ganti dengan {config.label}</label>
              <select
                value={reassignToId}
                onChange={(e) => setReassignToId(e.target.value)}
                className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
              >
                <option value="">-- Pilih {config.label} pengganti --</option>
                {rows
                  .filter((r) => r.id !== deleteBlocked.row.id)
                  // Bugfix (Fase 13): data pengganti untuk reassign-lalu-hapus tidak boleh berupa
                  // baris yang sudah tidak aktif juga — kalau boleh, referensi yang dipindahkan
                  // cuma pindah dari satu data tidak aktif ke data tidak aktif lain, memunculkan
                  // lagi masalah "data tidak aktif tapi masih terpakai/terpilih".
                  .filter((r) => isRowActive(r))
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
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteBlocked(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleReassignAndDelete}
                disabled={!reassignToId || reassigning}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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

/** Dipakai baik di kolom tabel maupun modal Detail — render sesuai tipe field, termasuk badge
 * Active/Inactive untuk boolean displayAs:'select' (mis. is_active Master Status) dan Ya/Tidak
 * untuk checkbox biasa. */
function renderCellForTable(field: FieldConfig, value: string, fieldOptions?: SelectOption[]) {
  if (field.key === 'status') return <StatusBadge value={value} />;
  if (field.type === 'boolean' && field.displayAs === 'select') {
    const labels = field.selectLabels || ['Active', 'Inactive'];
    return <StatusBadge value={value === 'Ya' ? labels[0] : labels[1]} />;
  }
  if (field.type === 'boolean') return value === 'Ya' ? 'Yes' : 'No';
  if (field.type === 'color' && value) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-full border border-gray-200" style={{ backgroundColor: value }} />
        {value}
      </span>
    );
  }
  return renderCellValue(field, value, fieldOptions);
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
  // Checkbox tunggal (Fase 12, sesuai video) — label field dipakai sebagai teks di samping
  // checkbox, jadi TIDAK menampilkan label judul terpisah di atasnya seperti field lain.
  if (field.type === 'boolean' && field.displayAs === 'checkbox') {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={value === 'Ya'}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? 'Ya' : 'Tidak')}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus-ring"
          />
          {field.label}
        </label>
        {field.helperText && <p className="mt-1 text-xs text-gray-400">{field.helperText}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
        {disabled && <span className="ml-1 text-xs font-normal text-gray-400">(tidak bisa diubah)</span>}
      </label>

      {field.type === 'select' && (
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
        >
          <option value="">-- Pilih --</option>
          {(options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === 'boolean' && field.displayAs === 'select' && (
        <select
          value={value === 'Ya' ? (field.selectLabels || ['Active', 'Inactive'])[0] : (field.selectLabels || ['Active', 'Inactive'])[1]}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === (field.selectLabels || ['Active', 'Inactive'])[0] ? 'Ya' : 'Tidak')}
          className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
        >
          {(field.selectLabels || ['Active', 'Inactive']).map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      )}

      {field.type === 'boolean' && (!field.displayAs || field.displayAs === 'radio') && (
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
          className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
        />
      )}

      {field.type === 'color' && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#([0-9a-fA-F]{6})$/.test(value) ? value : '#6366f1'}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-white p-1 disabled:cursor-not-allowed"
          />
          <input
            type="text"
            value={value}
            disabled={disabled}
            placeholder="#2563eb"
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>
      )}

      {(field.type === 'text' || field.type === 'email' || field.type === 'number' || field.type === 'date') && (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
        />
      )}

      {field.helperText && <p className="mt-1 text-xs text-gray-400">{field.helperText}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
