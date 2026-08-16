'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { EntityConfig, FieldConfig } from '@/lib/master-data/config';
import { parseCsv, buildCsv, downloadCsv } from '@/lib/csv';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useTableControls } from '@/lib/hooks/use-table-controls';
import { SortableHeader, TableSearchBox, PaginationBar } from '@/components/table-controls';
import { Badge, StatusBadge } from '@/components/badge';
import { useLanguage } from '@/components/language-provider';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { getViewCache, setViewCache } from '@/lib/hooks/view-cache';
import type { TranslationKey } from '@/lib/i18n/translations';

type TFn = (key: TranslationKey) => string;

/** Resolusi label/placeholder/helperText field lewat i18n key kalau tersedia, jatuh ke string
 *  mentah di config kalau belum ada key-nya (permintaan user: sweep i18n menyeluruh termasuk
 *  Master Data — lihat catatan labelKey/placeholderKey/helperTextKey di lib/master-data/config.ts). */
function fieldLabel(t: TFn, f: FieldConfig): string {
  return f.labelKey ? t(f.labelKey) : f.label;
}
function fieldPlaceholder(t: TFn, f: FieldConfig): string | undefined {
  return f.placeholderKey ? t(f.placeholderKey) : f.placeholder;
}
function fieldHelperText(t: TFn, f: FieldConfig): string | undefined {
  return f.helperTextKey ? t(f.helperTextKey) : f.helperText;
}
function entityLabel(t: TFn, config: EntityConfig): string {
  return config.labelKey ? t(config.labelKey) : config.label;
}
function entityLabelPlural(t: TFn, config: EntityConfig): string {
  return config.labelPluralKey ? t(config.labelPluralKey) : config.labelPlural;
}
function entityPageTitle(t: TFn, config: EntityConfig): string {
  return config.pageTitleKey ? t(config.pageTitleKey) : config.pageTitle;
}
function entitySubtitle(t: TFn, config: EntityConfig, count: number): string {
  const template = config.subtitleTemplateKey ? t(config.subtitleTemplateKey) : config.subtitleTemplate;
  return template.replace('{count}', String(count));
}

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
  const { t } = useLanguage();
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

  // Perbaikan (permintaan user): layer utama di belakang modal tidak boleh ikut ke-scroll selama
  // salah satu dari 4 modal di komponen ini terbuka (Tambah/Edit, Detail, Hasil Impor, Hapus Diblokir).
  useBodyScrollLock(modalOpen || !!viewingRow || !!importResults || !!deleteBlocked);

  const [reassignToId, setReassignToId] = useState('');
  const [reassigning, setReassigning] = useState(false);
  // Fase 15: tombol naik/turun urutan di tabel Master Status (lihat handleMoveStatus).
  const [reorderingStatus, setReorderingStatus] = useState(false);

  // Bugfix (permintaan user, item loading-flicker): sama seperti komponen Task — reload setelah
  // aksi Tambah/Edit/Hapus/Import/Reorder (`silent: true`) tidak lagi mengganti baris tabel dengan
  // "Memuat..." sesaat, data cuma di-refresh diam-diam di belakang layar.
  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [rowsRes, optsRes] = await Promise.all([
        apiFetch(`/api/master/${entityKey}`),
        apiFetch(`/api/master/${entityKey}/options`),
      ]);
      const rowsJson = await parseJsonSafe(rowsRes);
      const optsJson = await parseJsonSafe(optsRes);
      if (!rowsRes.ok || !rowsJson.data) throw new Error(rowsJson.error || t('toast_load_data_failed'));
      setRows(rowsJson.data);
      setOptions(optsJson.data || {});
      // Perbaikan Round 21 (poin 3 — "sesuaikan di halaman lain dengan kasus serupa, tolong cek
      // ulang"): sama seperti List/Kanban/Calendar Tasking, simpan hasilnya ke cache antar-navigasi
      // (Round 7, poin 3) supaya kunjungan BERIKUTNYA ke entity yang SAMA dalam sesi tab ini instan
      // — lihat catatan lengkap penyebab & solusinya di useEffect di bawah (beda dari Tasking:
      // masing-masing entity Master Data punya datanya sendiri-sendiri, jadi TIDAK ada cross-populate
      // seperti primeAllTaskViewsCache, cuma cache per-entity biasa).
      setViewCache(`master:${entityKey}:rows`, rowsJson.data);
      setViewCache(`master:${entityKey}:opts`, optsJson.data || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_load_data_failed'));
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

  // Perbaikan Round 21 (poin 3 — "ketika saya berpindah view ... tampilan muncul 'memuat' ...
  // sesuaikan di halaman lain dengan kasus serupa"): `MasterDataTable` dipakai oleh SEMUA entity
  // Master Data lewat 1 instance komponen yang SAMA (`entityKey` cuma prop, komponennya sendiri
  // TIDAK di-remount tiap ganti entity — lihat `/master/[entity]/page.tsx`), jadi `loading` TIDAK
  // otomatis reset ke awal cuma karena `entityKey` berubah. Sebelumnya `load()` (lewat efek
  // `[load]`, yang berubah identitasnya tiap `entityKey` ganti karena `useCallback` di atas)
  // SELALU dipanggil non-silent, jadi SETIAP kali pindah entity (Client -> Project -> Client lagi,
  // dst) tabel mem-blank ke "Memuat..." sesaat — padahal kalau entity itu SUDAH PERNAH dibuka
  // sebelumnya dalam sesi tab ini, datanya sudah ada di cache. Sekarang: cek cache per-entity dulu
  // — kalau ada, langsung tampilkan (silent reload di background); kalau belum pernah (entity
  // BENAR-BENAR baru dibuka pertama kali), baru tampilkan "Memuat..." (tidak terhindarkan — datanya
  // memang belum pernah diambil sama sekali, beda dengan kasus Tasking yang List/Kanban/Calendar
  // berbagi sumber data PERSIS SAMA).
  useEffect(() => {
    const cachedRows = getViewCache<Row[]>(`master:${entityKey}:rows`);
    const cachedOpts = getViewCache<Record<string, SelectOption[]>>(`master:${entityKey}:opts`);
    if (cachedRows) {
      setRows(cachedRows);
      setOptions(cachedOpts || {});
      setLoading(false);
    } else {
      setLoading(true);
    }
    load({ silent: !!cachedRows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

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
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else toast.error(json.error || t('toast_save_task_failed'));
        return;
      }
      setModalOpen(false);
      await load({ silent: true });
      toast.success(
        editingRow
          ? `${entityLabel(t, config)} ${t('toast_update_success_suffix')}`
          : `${entityLabel(t, config)} ${t('toast_create_success_suffix')}`
      );
    } catch {
      toast.error(t('toast_network_error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: Row) {
    const title = row[config.titleField] || row.id;
    const ok = await confirmDialog({
      message: `${t('confirm_delete_generic_prefix')} ${entityLabel(t, config).toLowerCase()} "${title}"?`,
      confirmLabel: t('action_delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/master/${entityKey}/${row.id}`, { method: 'DELETE' });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        if (res.status === 409 && json.reassignable) {
          setDeleteBlocked({ row, message: json.error, reassignable: true });
          setReassignToId('');
        } else {
          toast.error(json.error || t('toast_delete_data_failed'));
        }
        return;
      }
      await load({ silent: true });
      toast.success(`${entityLabel(t, config)} "${title}" ${t('toast_task_deleted_suffix')}`);
    } catch {
      toast.error(t('toast_network_error'));
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
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        toast.error(json.error || t('toast_reassign_delete_failed'));
        return;
      }
      setDeleteBlocked(null);
      await load({ silent: true });
      toast.success(`${entityLabel(t, config)} ${t('toast_reassign_delete_success_suffix')}`);
    } catch {
      toast.error(t('toast_network_error'));
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
      const json1 = await parseJsonSafe(res1);
      if (!res1.ok) throw new Error(json1.error || t('toast_reorder_failed'));

      const res2 = await apiFetch(`/api/master/${entityKey}/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otherPayload),
      });
      const json2 = await parseJsonSafe(res2);
      if (!res2.ok) throw new Error(json2.error || t('toast_reorder_failed'));
      toast.success(t('toast_reorder_success'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toast_reorder_failed'));
    } finally {
      // Selalu reload, sukses ataupun gagal di tengah jalan — supaya tabel selalu mencerminkan
      // urutan yang SEBENARNYA tersimpan di server, bukan asumsi optimistik di client.
      await load({ silent: true });
      setReorderingStatus(false);
    }
  }

  function handleExportCsv() {
    const header = config.fields.map((f) => fieldLabel(t, f));
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
            rowError = `${fieldLabel(t, field)}: "${raw}" ${field.optionsFrom ? t('md_import_not_found_related') : t('md_import_not_found_options')}`;
            break;
          }
          payload[field.key] = match.value;
        } else if (field.type === 'multiselect') {
          if (!raw) {
            payload[field.key] = '';
            continue;
          }
          const opts = options[field.key] || [];
          const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
          const ids: string[] = [];
          let notFound: string | null = null;
          for (const part of parts) {
            const match = opts.find(
              (o) => o.label.toLowerCase() === part.toLowerCase() || o.value.toLowerCase() === part.toLowerCase()
            );
            if (!match) {
              notFound = part;
              break;
            }
            ids.push(match.value);
          }
          if (notFound) {
            rowError = `${fieldLabel(t, field)}: "${notFound}" ${t('md_import_not_found_related')}`;
            break;
          }
          payload[field.key] = ids.join(',');
        } else if (field.type === 'boolean') {
          const norm = raw.toLowerCase();
          payload[field.key] = ['ya', 'true', 'yes', '1'].includes(norm) ? 'Ya' : 'Tidak';
        } else {
          payload[field.key] = raw;
        }
      }

      const rowTitle = payload[config.titleField] || `(${t('md_import_row_label')} ${rowNumber})`;

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
        const json = await parseJsonSafe(res);
        if (!res.ok) {
          const msg = json.fieldErrors ? Object.values(json.fieldErrors).join('; ') : json.error || t('md_import_save_failed');
          results.push({ rowNumber, title: rowTitle, ok: false, message: msg });
        } else {
          results.push({ rowNumber, title: rowTitle, ok: true, message: t('md_import_row_success') });
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
    if (failCount === 0) toast.success(t('toast_import_done_success').replace('{ok}', String(okCount)));
    else toast.error(t('toast_import_done_mixed').replace('{ok}', String(okCount)).replace('{fail}', String(failCount)));
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

  const subtitle = entitySubtitle(t, config, rows.length);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{entityPageTitle(t, config)}</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.canExport && (
            <button
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('md_export_csv')}
            </button>
          )}
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
                + {t('action_add')} {entityLabel(t, config)}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 p-4">
          <TableSearchBox value={table.search} onChange={table.setSearch} placeholder={`${t('md_search_placeholder_prefix')} ${entityLabelPlural(t, config).toLowerCase()}...`} />
        </div>

        {error && <div className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
        {isStatusesTable ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <SortableHeader
                  label={t('md_col_kanban_order')}
                  active={table.sortKey === 'sort_order'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('sort_order')}
                />
                <SortableHeader
                  label={t('md_col_name')}
                  active={table.sortKey === 'status_name'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('status_name')}
                />
                <SortableHeader
                  label={t('md_field_workflow_level')}
                  active={table.sortKey === 'workflow_level'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('workflow_level')}
                />
                <th className="px-4 py-2 font-medium">{t('md_col_markers')}</th>
                <SortableHeader
                  label={t('col_status')}
                  active={table.sortKey === 'is_active'}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort('is_active')}
                />
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
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    {t('md_no_data')}
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
                          {row.is_default === 'Ya' && <Badge label={t('md_badge_default')} tone="info" />}
                          {row.is_final === 'Ya' && <Badge label={t('md_badge_final')} tone="success" />}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge value={row.is_active === 'Ya' ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => openDetailModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                          {t('action_detail')}
                        </button>
                        {permissions.canEdit && (
                          <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                            {t('action_edit')}
                          </button>
                        )}
                        {permissions.canDelete && (
                          <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                            {t('action_delete')}
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
                  label={fieldLabel(t, f)}
                  active={table.sortKey === f.key}
                  dir={table.sortDir}
                  onClick={() => table.toggleSort(f.key)}
                />
              ))}
              <th className="px-4 py-2 font-medium">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-4 py-6 text-center text-gray-400">
                  {t('common_loading')}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-4 py-6 text-center text-gray-400">
                  {t('md_no_data')}
                </td>
              </tr>
            )}
            {!loading && rows.length > 0 && table.paged.length === 0 && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-4 py-6 text-center text-gray-400">
                  {t('md_no_match')}
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
                        {renderCellForTable(t, f, row[f.key], options[f.key])}
                        {idx === 0 && isSystemRow && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[0.625rem] font-medium uppercase text-gray-500">
                            {t('md_badge_system')}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <button onClick={() => openDetailModal(row)} className="mr-3 text-gray-600 hover:text-gray-900">
                        {t('action_detail')}
                      </button>
                      {permissions.canEdit && (
                        <button onClick={() => openEditModal(row)} className="mr-3 text-indigo-600 hover:text-indigo-800">
                          {t('action_edit')}
                        </button>
                      )}
                      {permissions.canDelete && !isSystemRow && (
                        <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800">
                          {t('action_delete')}
                        </button>
                      )}
                      {permissions.canDelete && isSystemRow && (
                        <span className="text-gray-300" title={t('md_system_row_delete_title')}>
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
                {editingRow ? `${t('action_edit')} ${entityLabel(t, config)}` : `${t('action_add')} ${entityLabel(t, config)}`}
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
                  {renderFormFields(config.fields.filter((f) => !f.hiddenInForm), {
                    formValues,
                    fieldErrors,
                    options,
                    editingRow,
                    setFormValues,
                  })}
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t('action_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? t('common_saving') : editingRow ? t('form_save_changes') : `${t('form_create')} ${entityLabel(t, config)}`}
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
              <h2 className="text-lg font-semibold text-gray-900">{entityLabel(t, config)} {t('md_detail_suffix')}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <dl className="space-y-3 text-sm">
                {config.fields.map((f) => (
                  <div key={f.key} className="flex justify-between gap-4">
                    <dt className="text-gray-500">{fieldLabel(t, f)}</dt>
                    <dd className="text-right text-gray-900">{renderCellForTable(t, f, viewingRow[f.key], options[f.key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-4">
              <button
                onClick={() => setViewingRow(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
              <p className="mt-1 text-sm text-gray-500">
                {importResults.filter((r) => r.ok).length} {t('md_import_result_success')}, {importResults.filter((r) => !r.ok).length} {t('md_import_result_failed')}
                {' '}{t('md_import_result_from')} {importResults.length} {t('md_import_result_rows')}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
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
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {t('td_close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('md_delete_blocked_title')}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="mb-4 text-sm text-gray-600">{deleteBlocked.message}</p>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('md_replace_with_prefix')} {entityLabel(t, config)}</label>
              <select
                value={reassignToId}
                onChange={(e) => setReassignToId(e.target.value)}
                className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring"
              >
                <option value="">{t('md_option_choose_replacement_prefix')} {entityLabel(t, config)} {t('md_option_choose_replacement_suffix')}</option>
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
                {t('md_reassign_note_prefix')} &quot;{deleteBlocked.row[config.titleField]}&quot; {t('md_reassign_note_suffix')}
                {' '}&quot;{deleteBlocked.row[config.titleField]}&quot; {t('md_reassign_note_end')}
              </p>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteBlocked(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('action_cancel')}
              </button>
              <button
                onClick={handleReassignAndDelete}
                disabled={!reassignToId || reassigning}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {reassigning ? t('md_reassign_processing') : t('md_reassign_confirm_btn')}
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
function renderCellForTable(t: TFn, field: FieldConfig, value: string, fieldOptions?: SelectOption[]) {
  if (field.key === 'status') return <StatusBadge value={value} />;
  if (field.type === 'boolean' && field.displayAs === 'select') {
    const labels = field.selectLabels || ['Active', 'Inactive'];
    return <StatusBadge value={value === 'Ya' ? labels[0] : labels[1]} />;
  }
  if (field.type === 'boolean') return value === 'Ya' ? t('dashboard_yes') : t('dashboard_no');
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

function multiselectLabels(value: string, fieldOptions?: SelectOption[]): string[] {
  const ids = (value || '').split(',').map((v) => v.trim()).filter(Boolean);
  return ids.map((id) => fieldOptions?.find((o) => o.value === id)?.label || id);
}

function renderCellValue(field: FieldConfig, value: string, fieldOptions?: SelectOption[]) {
  if (field.type === 'select' && fieldOptions) {
    const match = fieldOptions.find((o) => o.value === value);
    return match?.label || value || '-';
  }
  if (field.type === 'multiselect') {
    const labels = multiselectLabels(value, fieldOptions);
    return labels.length > 0 ? labels.join(', ') : '-';
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
  if (field.type === 'multiselect') {
    return multiselectLabels(value, fieldOptions).join(', ');
  }
  return value || '';
}

/**
 * Permintaan user (fitur Is Admin/Is Leader di Master Role): render field form generik, TAPI
 * field boolean checkbox yang punya `inlineGroup` sama dan berurutan langsung di `fields`
 * dirender SEJAJAR (side-by-side) dalam satu baris flex, bukan satu per baris seperti biasa.
 * Juga menangani `exclusiveWith` — men-set field lain ke "Tidak" otomatis saat field ini di-set
 * "Ya" (mutually exclusive di UI; validasi sebenarnya tetap di server, lihat
 * POST/PATCH /api/master/[entity]).
 */
function renderFormFields(
  fields: FieldConfig[],
  ctx: {
    formValues: Record<string, string>;
    fieldErrors: Record<string, string>;
    options: Record<string, SelectOption[]>;
    editingRow: Row | null;
    setFormValues: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  }
): React.ReactNode[] {
  const { formValues, fieldErrors, options, editingRow, setFormValues } = ctx;

  function makeOnChange(f: FieldConfig) {
    return (v: string) =>
      setFormValues((prev) => {
        const next = { ...prev, [f.key]: v };
        if (f.exclusiveWith && v === 'Ya') next[f.exclusiveWith] = 'Tidak';
        return next;
      });
  }

  function renderOne(f: FieldConfig) {
    return (
      <FieldInput
        key={f.key}
        field={f}
        value={formValues[f.key] ?? ''}
        error={fieldErrors[f.key]}
        options={options[f.key]}
        disabled={!!(f.lockOnEdit && editingRow)}
        onChange={makeOnChange(f)}
      />
    );
  }

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.inlineGroup && next && next.inlineGroup === f.inlineGroup) {
      nodes.push(
        <div key={f.key} className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="flex-1">{renderOne(f)}</div>
          <div className="flex-1">{renderOne(next)}</div>
        </div>
      );
      i++; // field kedua sudah dirender bersama, lewati di iterasi berikutnya
      continue;
    }
    nodes.push(renderOne(f));
  }
  return nodes;
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
  const { t } = useLanguage();
  const label = fieldLabel(t, field);
  const placeholder = fieldPlaceholder(t, field);
  const helperText = fieldHelperText(t, field);

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
          {label}
        </label>
        {helperText && <p className="mt-1 text-xs text-gray-400">{helperText}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {field.required && <span className="text-red-500"> *</span>}
        {disabled && <span className="ml-1 text-xs font-normal text-gray-400">{t('md_field_disabled_note')}</span>}
      </label>

      {field.type === 'select' && (
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="select-field w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3.5 pr-9 text-sm text-gray-900 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
        >
          <option value="">{t('md_option_choose')}</option>
          {(options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {/* Multi-select (mis. Project Terkait pada Client) — daftar checkbox, nilainya disimpan
          sebagai satu string ID dipisah koma (lihat validateEntityPayload). */}
      {field.type === 'multiselect' && (() => {
        const selected = value.split(',').map((v) => v.trim()).filter(Boolean);
        return (
          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-gray-300 bg-white p-2.5">
            {(options || []).length === 0 && <p className="text-xs text-gray-400">{t('md_no_data_short')}</p>}
            {(options || []).map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, opt.value]
                        : selected.filter((v) => v !== opt.value);
                      onChange(next.join(','));
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus-ring"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        );
      })()}

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
          {(['Ya', 'Tidak'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name={field.key}
                checked={value === opt}
                disabled={disabled}
                onChange={() => onChange(opt)}
              />
              {opt === 'Ya' ? t('dashboard_yes') : t('dashboard_no')}
            </label>
          ))}
        </div>
      )}

      {field.type === 'textarea' && (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
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
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring disabled:bg-gray-100 disabled:text-gray-500"
        />
      )}

      {helperText && <p className="mt-1 text-xs text-gray-400">{helperText}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
