'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';

export type TimeTrackingState = {
  state: 'idle' | 'running' | 'paused';
  currentSessionNo: number | null;
  currentSessionIsReview: boolean;
  closedSeconds: number;
  closedWorkSeconds: number;
  closedReviewSeconds: number;
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
    // Kartu Kanban (compact) menampilkan Work Time & Review Time sebagai dua baris terpisah,
    // meniru tampilan kartu status Done/Canceled di aplikasi lama — bukan satu baris gabungan.
    if (compact) {
      return (
        <div className="w-full space-y-0.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Work Time</span>
            <span className="tabular-nums font-medium text-gray-700">{formatDuration(tt.closedWorkSeconds)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Review Time</span>
            <span className="tabular-nums font-medium text-amber-600">{formatDuration(tt.closedReviewSeconds)}</span>
          </div>
        </div>
      );
    }
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

  // Warna tombol meniru components/TimeTrackingWidget.php aplikasi lama: Start/Resume = filled
  // indigo (brand), Pause = outline amber, Stop = outline merah, Back = outline netral,
  // Done = filled emerald (success) — bukan flat abu-abu seperti sebelumnya.
  const base = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const startClass = `${base} bg-indigo-600 text-white hover:bg-indigo-700`;
  const pauseClass = `${base} border border-amber-500/40 text-amber-600 hover:bg-amber-50`;
  const stopClass = `${base} border border-red-500/40 text-red-600 hover:bg-red-50`;
  const backClass = `${base} border border-gray-300 text-gray-900 hover:bg-gray-100`;
  const doneClass = `${base} bg-emerald-600 text-white hover:bg-emerald-700`;
  const wrapClass = compact ? 'flex flex-wrap items-center gap-1.5' : 'flex items-center gap-1.5';

  const IconPlay = (
    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
  const IconPause = (
    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  );
  const IconStop = (
    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );
  const IconBack = (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
  const IconDone = (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );

  if (status.isReview) {
    return (
      <div className={wrapClass}>
        <span className="tabular-nums text-gray-600">{formatDuration(displaySeconds)}</span>
        <button disabled={busy} onClick={(e) => runAction('back', e)} className={backClass}>
          {IconBack}
          Back
        </button>
        <button disabled={busy} onClick={(e) => runAction('done', e)} className={doneClass}>
          {IconDone}
          Done
        </button>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <span className="tabular-nums text-gray-600">{formatDuration(displaySeconds)}</span>
      {tt.state === 'idle' && (
        <button disabled={busy} onClick={(e) => runAction('start', e)} className={startClass}>
          {IconPlay}
          Start
        </button>
      )}
      {tt.state === 'running' && (
        <>
          <button disabled={busy} onClick={(e) => runAction('pause', e)} className={pauseClass}>
            {IconPause}
            Pause
          </button>
          <button disabled={busy} onClick={(e) => runAction('stop', e)} className={stopClass}>
            {IconStop}
            Stop
          </button>
        </>
      )}
      {tt.state === 'paused' && (
        <>
          <button disabled={busy} onClick={(e) => runAction('resume', e)} className={startClass}>
            {IconPlay}
            Resume
          </button>
          <button disabled={busy} onClick={(e) => runAction('stop', e)} className={stopClass}>
            {IconStop}
            Stop
          </button>
        </>
      )}
    </div>
  );
}
