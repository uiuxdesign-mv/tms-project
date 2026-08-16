import type { DueDateTrendBucket } from '@/lib/reports/types';

/**
 * Chart batang vertikal untuk tren mingguan (Fase 10 — Dashboard chart #5, dipakai juga di
 * Report). Komponen murni, aman dipakai dari Server maupun Client Component. Batang merah
 * menandakan minggu yang sudah lewat & ada task overdue di dalamnya.
 */
export function WeeklyTrendChart({ buckets }: { buckets: DueDateTrendBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));

  if (buckets.every((b) => b.count === 0)) {
    return <p className="text-sm text-gray-400">Tidak ada task dengan jatuh tempo di rentang ini.</p>;
  }

  return (
    // Perbaikan (permintaan user, "sesuaikan ukuran semua tampilan menjadi 80%"): tinggi 120 di
    // sini diganti ke '7.5rem' (setara 120px di skala 100%) — sama alasannya dengan
    // vertical-bar-chart.tsx (style inline px mentah tidak otomatis ikut menyusut lewat font-size
    // root).
    <div className="flex items-end gap-1.5" style={{ height: '7.5rem' }}>
      {buckets.map((b) => {
        const heightPct = (b.count / max) * 100;
        const hasOverdue = b.overdueCount > 0;
        return (
          <div key={b.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
            <span className="text-[0.625rem] text-gray-500">{b.count > 0 ? b.count : ''}</span>
            <div
              className={`w-full rounded-t ${hasOverdue ? 'bg-red-500' : 'bg-gray-900'}`}
              style={{ height: `${Math.max(2, heightPct)}%`, minHeight: b.count > 0 ? 4 : 0 }}
              title={`${b.weekLabel}: ${b.count} task${hasOverdue ? `, ${b.overdueCount} terlambat` : ''}`}
            />
            <span className="text-[0.625rem] text-gray-400">{b.weekLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
