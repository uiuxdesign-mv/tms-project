import { addDays, mondayOf, rangeBounds, type QuickRange } from './date-range';

/**
 * Bucket chart "Productivity Trend" (line chart, Fase 11) — granularitas mengikuti Quick Filter
 * terpilih supaya jumlah titik pada sumbu-x tetap masuk akal: per jam untuk "Today", per hari
 * untuk "This Week"/"This Month", per bulan untuk "This Year". Fungsi murni, dipakai dari
 * komponen client Dashboard.
 */
export type TrendPoint = { key: string; label: string; hours: number };

const MONTH_LABELS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function computeProductivityTrend(
  intervals: { startedAt: string; seconds: number }[],
  range: QuickRange,
  lang: 'id' | 'en' = 'id',
  now: Date = new Date()
): TrendPoint[] {
  const { start, end } = rangeBounds(range, now);
  const monthLabels = lang === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_ID;

  if (range === 'today') {
    const buckets: TrendPoint[] = Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: `${String(h).padStart(2, '0')}:00`,
      hours: 0,
    }));
    for (const iv of intervals) {
      if (iv.startedAt.slice(0, 10) !== start) continue;
      const hour = new Date(iv.startedAt).getUTCHours();
      buckets[hour].hours += iv.seconds / 3600;
    }
    return buckets;
  }

  if (range === 'week') {
    const monday = mondayOf(now);
    const buckets: TrendPoint[] = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      return { key: d, label: d.slice(8, 10), hours: 0 };
    });
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const iv of intervals) {
      const d = iv.startedAt.slice(0, 10);
      const bucket = byKey.get(d);
      if (bucket) bucket.hours += iv.seconds / 3600;
    }
    return buckets;
  }

  if (range === 'month') {
    const buckets: TrendPoint[] = [];
    let cursor = start;
    while (cursor <= end) {
      buckets.push({ key: cursor, label: cursor.slice(8, 10), hours: 0 });
      cursor = addDays(cursor, 1);
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const iv of intervals) {
      const d = iv.startedAt.slice(0, 10);
      const bucket = byKey.get(d);
      if (bucket) bucket.hours += iv.seconds / 3600;
    }
    return buckets;
  }

  // year -> 12 bucket bulanan
  const year = now.getUTCFullYear();
  const buckets: TrendPoint[] = Array.from({ length: 12 }, (_, m) => ({
    key: String(m),
    label: monthLabels[m],
    hours: 0,
  }));
  for (const iv of intervals) {
    const dt = new Date(iv.startedAt);
    if (dt.getUTCFullYear() !== year) continue;
    buckets[dt.getUTCMonth()].hours += iv.seconds / 3600;
  }
  return buckets;
}
