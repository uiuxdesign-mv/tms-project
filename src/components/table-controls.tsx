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
        <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
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

/** Bar pagination generik (Sebelumnya/Selanjutnya + info halaman) — dipakai di bawah semua tabel. */
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
  if (totalCount === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
      <span>
        Menampilkan {from}–{to} dari {totalCount} data
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
        >
          ← Sebelumnya
        </button>
        <span className="px-2 text-xs text-gray-500">
          Halaman {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
        >
          Selanjutnya →
        </button>
      </div>
    </div>
  );
}
