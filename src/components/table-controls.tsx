import { useLanguage } from '@/components/language-provider';
import type { SortDir } from '@/lib/hooks/use-table-controls';

/**
 * Header kolom yang bisa diklik untuk sort (Fase 10) — dipakai bersama oleh semua tabel yang
 * pakai useTableControls().
 */
export function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}
      >
        {label}
        <span className="text-[0.625rem]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

/** Search box generik untuk toolbar tabel. */
export function TableSearchBox({
  value,
  onChange,
  placeholder = 'Cari...',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
    />
  );
}

/**
 * Susun daftar nomor halaman yang ditampilkan di pagination, dengan "…" (ellipsis) untuk halaman
 * yang di-skip — SELALU tampilkan halaman 1 & terakhir, plus 1 tetangga kiri-kanan dari halaman
 * aktif. Contoh: total 10 halaman, aktif di halaman 5 → [1, '…', 4, 5, 6, '…', 10]. Kalau total
 * halaman sedikit (≤ 5), tidak ada yang di-skip sama sekali, semua nomor tampil.
 */
function buildPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 1) return [1];
  const neighbors = 1;
  const keep = new Set<number>([1, total]);
  for (let i = current - neighbors; i <= current + neighbors; i++) {
    if (i > 1 && i < total) keep.add(i);
  }
  const sorted = Array.from(keep).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push('ellipsis');
    result.push(p);
    prev = p;
  }
  return result;
}

/**
 * Bar pagination generik — dipakai di bawah semua tabel data (Tasks, Users, Master Data, Audit
 * Log, Report). Perbaikan (permintaan user, riset referensi pola pagination — lihat catatan
 * ringkasan): sebelumnya cuma Sebelumnya/Selanjutnya + teks "Halaman X/Y" polos, sekarang nomor
 * halaman langsung bisa diklik (dengan "…" kalau halamannya banyak) — gaya yang sama dipakai
 * Amazon/Kayak, dipilih user dari 4 opsi yang diajukan (nomor+ellipsis / prev-next rapi / +tombol
 * awal-akhir / +input ke-halaman).
 */
export function PaginationBar({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (totalCount === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const showingText = t('pagination_showing')
    .replace('{from}', String(from))
    .replace('{to}', String(to))
    .replace('{total}', String(totalCount));
  const pageNumbers = buildPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
      <span>{showingText}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('pagination_prev')}
          title={t('pagination_prev')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          ‹
        </button>
        {pageNumbers.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="w-8 shrink-0 select-none text-center text-xs text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors ${
                p === page
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('pagination_next')}
          title={t('pagination_next')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          ›
        </button>
      </div>
    </div>
  );
}
