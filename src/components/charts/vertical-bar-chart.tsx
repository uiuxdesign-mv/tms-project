/**
 * Bar chart vertikal generik (Fase 11 — Dashboard "Tasks per Project"/"Tasks per Client"/
 * "Assignee Workload"). Dipisah dari `WeeklyTrendChart` (yang API-nya spesifik untuk bucket
 * mingguan due-date & dipakai juga oleh halaman Report) supaya tidak mengubah kontrak komponen
 * yang sudah ada. Komponen murni, aman dipakai dari Server maupun Client Component.
 */
export type BarChartItem = { key: string; label: string; count: number };

export function VerticalBarChart({
  items,
  emptyLabel = 'Tidak ada data.',
  maxItems,
  barClassName = 'bg-sky-600',
}: {
  items: BarChartItem[];
  emptyLabel?: string;
  maxItems?: number;
  barClassName?: string;
}) {
  const shown = maxItems ? items.slice(0, maxItems) : items;
  const max = Math.max(1, ...shown.map((i) => i.count));

  if (shown.length === 0 || shown.every((i) => i.count === 0)) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2" style={{ height: 160 }}>
      {shown.map((item) => {
        const heightPct = (item.count / max) * 100;
        return (
          <div key={item.key} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
            <span className="text-[10px] text-gray-500">{item.count > 0 ? item.count : ''}</span>
            <div
              className={`w-full rounded-t ${barClassName}`}
              style={{ height: `${Math.max(2, heightPct)}%`, minHeight: item.count > 0 ? 4 : 0 }}
              title={`${item.label}: ${item.count}`}
            />
            <span className="w-full truncate text-center text-[10px] text-gray-400" title={item.label}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
