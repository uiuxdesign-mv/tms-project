/**
 * Helper murni (tanpa I/O) untuk Quick Filter Dashboard (Fase 11): Today/This Week/This
 * Month/This Year — meniru perilaku aplikasi lama persis seperti didokumentasikan di rekaman:
 * "Only filters the charts — summary cards always show current totals." Filter dihitung dari
 * `created_at` task, BUKAN due_date, dan dipakai baik di server (kalkulasi awal) maupun client
 * (dipilih ulang tiap tab Quick Filter diklik, tanpa reload halaman).
 */
export type QuickRange = 'today' | 'week' | 'month' | 'year';

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Senin dari minggu yang memuat `date`, dikembalikan sebagai string YYYY-MM-DD (UTC). */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Minggu..6=Sabtu
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function rangeBounds(range: QuickRange, now: Date = new Date()): { start: string; end: string } {
  const todayStr = toDateStr(now);
  if (range === 'today') return { start: todayStr, end: todayStr };
  if (range === 'week') {
    const monday = mondayOf(now);
    return { start: monday, end: addDays(monday, 6) };
  }
  if (range === 'month') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    return { start, end };
  }
  const y = now.getUTCFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** Jumlah hari kerja (Senin-Jumat) dari Senin minggu ini s/d hari ini (inklusif), minimal 1
 * supaya aman dipakai sebagai pembagi (mis. kalkulasi Produktivitas Mingguan). */
export function elapsedWeekdaysThisWeek(now: Date = new Date()): number {
  const monday = mondayOf(now);
  const today = toDateStr(now);
  let count = 0;
  let cursor = monday;
  while (cursor <= today) {
    const day = new Date(cursor + 'T00:00:00Z').getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor = addDays(cursor, 1);
  }
  return Math.max(1, count);
}

/** Saring task yang `created_at`-nya jatuh dalam rentang Quick Filter terpilih. */
export function filterByCreatedAt<T extends { created_at: string }>(
  items: T[],
  range: QuickRange,
  now: Date = new Date()
): T[] {
  const { start, end } = rangeBounds(range, now);
  return items.filter((it) => {
    const d = (it.created_at || '').slice(0, 10);
    return d !== '' && d >= start && d <= end;
  });
}
