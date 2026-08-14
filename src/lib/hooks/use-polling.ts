import { useEffect, useRef } from 'react';

/**
 * Polling generik (permintaan user Round 5, poin 2: "aksi di user A harus langsung ke-refresh di
 * user B tanpa refresh manual"). Aplikasi ini TIDAK punya infrastruktur real-time (tidak ada
 * WebSocket/Server-Sent Events/Redis pub-sub) — backend-nya murni Google Sheets REST API yang
 * dipanggil per-request, jadi cara paling sederhana & paling rendah risiko untuk mendekati
 * "real-time" adalah CLIENT-SIDE POLLING: tiap komponen yang perlu selalu up-to-date memanggil
 * ulang fungsi reload-nya sendiri secara berkala.
 *
 * Dijaga supaya TIDAK menabrak kembali masalah rate-limit Google Sheets API yang sudah diperbaiki
 * sebelumnya (lihat catatan kuota di lib/google/cache.ts — 300 read/menit per project, 60/menit
 * per service account):
 * - HANYA polling saat tab/halaman benar-benar aktif dilihat user (document.visibilityState ===
 *   'visible') — tab yang di-minimize/pindah tab lain otomatis berhenti polling, dan langsung
 *   polling ulang sekali begitu tab aktif lagi (supaya data tidak basi waktu user kembali).
 * - Interval default cukup longgar (lihat pemanggilnya masing-masing, umumnya 20-30 detik) — ini
 *   BUKAN live-update sungguhan (butuh WebSocket untuk itu), tapi cukup untuk memenuhi permintaan
 *   user "tidak perlu refresh manual" tanpa membebani kuota API secara berlebihan.
 * - `enabled=false` mematikan polling sepenuhnya (dipakai kalau komponen sedang tidak visible,
 *   mis. modal ditutup, supaya tidak polling sia-sia di background).
 */
export function usePolling(callback: () => void | Promise<void>, intervalMs: number, enabled: boolean = true): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      void callbackRef.current();
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') tick();
    }

    timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
