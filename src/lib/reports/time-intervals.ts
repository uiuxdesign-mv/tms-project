/**
 * Fungsi murni (tanpa I/O) untuk mengubah event log Time Tracking (Fase 8 — `task_time_logs`:
 * start/pause/resume/stop) menjadi daftar interval kerja yang sudah "closed" (punya waktu mulai
 * & selesai pasti). Dipisah dari `src/lib/models/time-tracking.ts` (yang server-only, mengimpor
 * `googleapis` lewat `sheet-table`) supaya aman diimpor dari komponen client Dashboard (Fase 11)
 * untuk kalkulasi ulang chart Tren Produktivitas tiap Quick Filter berganti.
 */
export type TimeLogEventLike = {
  task_id: string;
  user_id: string;
  session_no: string;
  action: 'start' | 'pause' | 'resume' | 'stop';
  occurred_at: string;
};

export type ClosedInterval = {
  taskId: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
};

function secondsBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return ms > 0 ? Math.round(ms / 1000) : 0;
}

/**
 * Replay seluruh event (lintas task) jadi interval closed. Dikelompokkan per `task_id` dulu
 * (session_no hanya unik per task, bukan global) baru di-replay start/resume -> pause/stop.
 */
export function computeClosedIntervals(events: TimeLogEventLike[]): ClosedInterval[] {
  const byTask = new Map<string, TimeLogEventLike[]>();
  for (const ev of events) {
    const list = byTask.get(ev.task_id) || [];
    list.push(ev);
    byTask.set(ev.task_id, list);
  }

  const result: ClosedInterval[] = [];
  for (const [taskId, taskEvents] of byTask) {
    const sorted = [...taskEvents].sort(
      (a, b) => a.occurred_at.localeCompare(b.occurred_at) || Number(a.session_no) - Number(b.session_no)
    );
    let openSince: string | null = null;
    let openUser: string | null = null;
    for (const ev of sorted) {
      if (ev.action === 'start' || ev.action === 'resume') {
        openSince = ev.occurred_at;
        openUser = ev.user_id;
      } else if (ev.action === 'pause' || ev.action === 'stop') {
        if (openSince) {
          result.push({
            taskId,
            userId: openUser || ev.user_id,
            startedAt: openSince,
            endedAt: ev.occurred_at,
            seconds: secondsBetween(openSince, ev.occurred_at),
          });
        }
        openSince = null;
        openUser = null;
      }
    }
  }
  return result;
}

/** Format detik jadi "Xh YYm" (mis. "78h 28m") atau "Ym" saja kalau < 1 jam (mis. "0m") — meniru
 * format yang dipakai aplikasi lama di feed "Recent Time Tracking". */
export function formatDurationShort(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
