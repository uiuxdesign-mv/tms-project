/**
 * Chart bar horizontal sederhana (Fase 10) — dipakai bersama oleh Dashboard & Report supaya
 * gayanya konsisten. Komponen murni (tanpa state/hook), aman dipakai baik dari Server Component
 * (Dashboard) maupun Client Component (Report).
 */
export type BarListItem = {
  key: string;
  label: string;
  count: number;
  /** Kelas warna Tailwind untuk bar ini, default `bg-gray-900`. */
  colorClassName?: string;
};

export function BarList({
  items,
  emptyLabel = 'Tidak ada data.',
  maxItems,
}: {
  items: BarListItem[];
  emptyLabel?: string;
  maxItems?: number;
}) {
  const shown = maxItems ? items.slice(0, maxItems) : items;
  const max = Math.max(1, ...shown.map((i) => i.count));

  if (shown.length === 0) {
    return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {shown.map((item) => (
        <div key={item.key}>
          <div className="mb-0.5 flex justify-between text-xs text-gray-600">
            <span className="truncate pr-2">{item.label}</span>
            <span className="shrink-0">{item.count}</span>
          </div>
          <div className="h-2 w-full rounded bg-gray-100">
            <div
              className={`h-2 rounded ${item.colorClassName || 'bg-gray-900'}`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
