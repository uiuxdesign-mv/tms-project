'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';

export type TimeTrackingState = {
  state: 'idle' | 'running' | 'paused';
  currentSessionNo: number | null;
  currentSessionIsReview: boolean;
  closedSeconds: number;
  liveSince: string | null;
};

export type TimeTrackingStatusFlags = { isFinal: boolean; isDefault: boolean; isReview: boolean };

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Kontrol Time Tracking (Fase 8) — dipakai bersama oleh tabel Task (`tasks-table.tsx`) dan papan
 * Kanban (`kanban-board.tsx`), supaya widget Start/Pause/Stop/Back/Done + badge live-ticking
 * hanya punya satu implementasi. Start/Pause/Stop untuk status non-final/non-review, Back/Done
 * untuk status review, read-only kalau status final. Live-ticking dihitung di client dari
 * `closedSeconds` (base dari server) + selisih waktu sejak `liveSince` kalau sedang running,
 * tanpa polling — cuma re-render tiap 1 detik lewat interval lokal komponen ini saja.
 */
export function TimeTrackingControls({
  taskId,
  timeTracking,
  status,
  canManage,
  onChanged,
  compact,
}: {
  taskId: string;
  timeTracking: TimeTrackingState | undefined;
  status: TimeTrackingStatusFlags | undefined;
  canManage: boolean;
  onChanged: () => void;
  /** Kanban card lebih sempit dari baris tabel — pakai layout wrap. */
  compact?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // `nowMs` (bukan langsung Date.now() di body render, yang dianggap impure oleh React) di-refresh
  // oleh interval di bawah setiap 1 detik selama sesi berjalan, supaya badge durasi live-ticking.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const tt = timeTracking;

  useEffect(() => {
    if (tt?.state !== 'running') return;
    // Sengaja tidak set nowMs langsung di sini (setState sinkron di body efek dianggap impure oleh
    // React) — interval di bawah akan mengisinya dalam <=1 detik, cukup untuk live-ticking.
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tt?.state]);

  if (!status || !tt) return <span className="text-gray-400">-</span>;

  if (status.isFinal) {
    return <span className="text-gray-500">{formatDuration(tt.closedSeconds)} (selesai)</span>;
  }

  const liveExtra =
    tt.state === 'running' && tt.liveSince && nowMs
      ? Math.max(0, Math.floor((nowMs - new Date(tt.liveSince).getTime()) / 1000))
      : 0;
  const displaySeconds = tt.closedSeconds + liveExtra;

  async function runAction(action: 'start' | 'pause' | 'resume' | 'stop' | 'back' | 'done', e?: React.MouseEvent) {
    e?.stopPropagation(); // jangan sampai memicu drag/klik kartu Kanban di baliknya
    setBusy(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/time-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Gagal menjalankan aksi Time Tracking.');
        return;
      }
      onChanged();
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return <span className="text-gray-500">{formatDuration(displaySeconds)}</span>;
  }

  const btnClass = 'rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50';
  const wrapClass = compact ? 'flex flex-wrap items-center gap-1.5' : 'flex items-center gap-1.5';

  if (status.isReview) {
    return (
      <div className={wrapClass}>
        <span className="tabular-nums text-gray-600">{formatDuration(displaySeconds)}</span>
        <button disabled={busy} onClick={(e) => runAction('back', e)} className={btnClass}>
          Back
        </button>
        <button disabled={busy} onClick={(e) => runAction('done', e)} className={btnClass}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <span className="tabular-nums text-gray-600">{formatDuration(displaySeconds)}</span>
      {tt.state === 'idle' && (
        <button disabled={busy} onClick={(e) => runAction('start', e)} className={btnClass}>
          Start
        </button>
      )}
      {tt.state === 'running' && (
        <>
          <button disabled={busy} onClick={(e) => runAction('pause', e)} className={btnClass}>
            Pause
          </button>
          <button disabled={busy} onClick={(e) => runAction('stop', e)} className={btnClass}>
            Stop
          </button>
        </>
      )}
      {tt.state === 'paused' && (
        <>
          <button disabled={busy} onClick={(e) => runAction('resume', e)} className={btnClass}>
            Resume
          </button>
          <button disabled={busy} onClick={(e) => runAction('stop', e)} className={btnClass}>
            Stop
          </button>
        </>
      )}
    </div>
  );
}
