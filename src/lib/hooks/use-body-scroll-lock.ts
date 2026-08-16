import { useLayoutEffect } from 'react';

// Counter global (bukan per-instance) — supaya modal bertingkat (mis. dialog konfirmasi Hapus
// yang muncul DI ATAS modal detail task yang sedang terbuka) tidak saling menimpa. Body baru
// di-unlock lagi kalau SEMUA modal yang memanggil hook ini sudah tertutup (counter kembali ke 0),
// bukan langsung begitu SALAH SATU modal-nya saja yang tertutup.
let lockCount = 0;
let previousOverflow: string | null = null;

/**
 * Kunci scroll layer utama (document.body) di belakang modal/dialog/drawer yang sedang terbuka
 * (permintaan user). Pakai useLayoutEffect (bukan useEffect) supaya kunci-nya langsung aktif
 * SEBELUM browser sempat paint — mencegah kedipan/"jump" singkat kalau modal dibuka saat halaman
 * di belakang sedang di-scroll.
 *
 * Efek ini murni manipulasi DOM (document.body.style.overflow), TIDAK memanggil setState apa pun
 * di dalamnya — jadi tidak kena lint `react-hooks/set-state-in-effect`.
 */
export function useBodyScrollLock(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow ?? '';
        previousOverflow = null;
      }
    };
  }, [active]);
}
