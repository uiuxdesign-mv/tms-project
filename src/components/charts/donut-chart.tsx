/**
 * Donut chart ringan (Fase 11 — Dashboard "Task Status" & "Priority Distribution") tanpa
 * dependency chart library baru: cincinnya dirender pakai CSS `conic-gradient`, lubang tengah
 * memakai lapisan putih di atasnya. Komponen murni, aman dipakai dari Server maupun Client
 * Component.
 */
export type DonutItem = { key: string; label: string; count: number; color?: string };

const PALETTE = ['#4f46e5', '#38bdf8', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];

export function DonutChart({ items, emptyLabel = 'Tidak ada data.' }: { items: DonutItem[]; emptyLabel?: string }) {
  const total = items.reduce((sum, i) => sum + i.count, 0);

  if (total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      </div>
    );
  }

  let cursor = 0;
  const stops: string[] = [];
  const colored = items
    .filter((i) => i.count > 0)
    .map((item, idx) => ({ ...item, color: item.color || PALETTE[idx % PALETTE.length] }));

  for (const item of colored) {
    const pct = (item.count / total) * 100;
    const from = cursor;
    const to = cursor + pct;
    stops.push(`${item.color} ${from}% ${to}%`);
    cursor = to;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
        {colored.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="flex justify-center">
        <div
          className="relative h-40 w-40 rounded-full"
          style={{ backgroundImage: `conic-gradient(${stops.join(', ')})` }}
        >
          <div className="absolute inset-[1rem] rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
}
