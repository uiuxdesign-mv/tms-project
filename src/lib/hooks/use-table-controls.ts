import { useEffect, useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

/**
 * Hook generik search + sort + pagination (Fase 10) — dipakai bersama oleh Master Data, Users, dan
 * Tasks supaya perilakunya konsisten di semua tabel: search di client (data sudah di-load penuh
 * dari server, konsisten dengan pola yang sudah ada di Report Fase 4), klik header kolom untuk
 * sort (klik lagi untuk balik arah), dan pagination supaya tabel tetap ringan meski datanya sudah
 * banyak.
 */
export function useTableControls<T extends Record<string, unknown>>(
  rows: T[],
  opts: {
    /** Field yang dicek saat search (dicocokkan sebagai substring, case-insensitive). */
    searchFields: (keyof T)[];
    pageSize?: number;
  }
) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  // Perbaikan (permintaan user): default maksimal 10 baris per halaman di SEMUA tabel data
  // (sebelumnya 20) — sisanya harus lewat pagination, bukan langsung tampil semua.
  const pageSize = opts.pageSize ?? 10;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => opts.searchFields.some((f) => String(r[f] ?? '').toLowerCase().includes(term)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      const cmp = av.localeCompare(bv, 'id', { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(
    () => sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [sorted, clampedPage, pageSize]
  );

  // Balik ke halaman 1 setiap kali hasil search/sort berubah komposisinya, supaya tidak "nyangkut"
  // di halaman kosong.
  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir]);

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return {
    search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    page: clampedPage,
    setPage,
    pageSize,
    totalPages,
    totalCount: sorted.length,
    paged,
  };
}
