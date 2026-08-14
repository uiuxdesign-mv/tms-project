/**
 * Cache in-memory sederhana, level modul JS (BUKAN localStorage/sessionStorage — dilarang dipakai
 * di artifact/aplikasi ini, dan lagipula tidak perlu bertahan lintas tab/reload di sini) — dipakai
 * untuk menghilangkan kedipan "Memuat..." saat pindah TAB di dalam satu halaman logis yang
 * sebenarnya terdiri dari beberapa route Next.js terpisah (permintaan user Round 7, poin 3).
 *
 * Kasusnya: 3 tampilan Task (List `/tasks`, Kanban `/tasks/kanban`, Calendar `/tasks/calendar`)
 * ditampilkan sebagai TAB dalam satu halaman "Tasking" (lihat TasksViewSwitcher), tapi masing-
 * masing sebenarnya route Next.js terpisah (App Router tidak punya cara nge-tab di 1 route tanpa
 * mengorbankan URL/back-button yang benar — lihat catatan di app/(app)/layout.tsx). Akibatnya
 * setiap pindah tab, komponen tujuan di-MOUNT ULANG dari nol: `rows`/`opts` kosong, `loading` mulai
 * dari `true`, lalu fetch API lagi dari awal — user melihat "Memuat..." sekilas setiap kali pindah
 * tab, padahal baru saja melihat data yang (hampir) sama beberapa detik lalu.
 *
 * Modul-level `Map` di sini bertahan selama runtime JS SPA ini hidup (dari login sampai reload
 * penuh/logout) — TIDAK ikut hilang saat pindah route (beda dengan state komponen), karena modul JS
 * di Next.js App Router hanya diimpor/dievaluasi SEKALI per sesi browser tab. Jadi begitu satu
 * tampilan pernah berhasil fetch data, tampilan lain yang dibuka setelahnya bisa langsung
 * me-render data CACHE itu sebagai render pertama (tanpa "Memuat..."), sambil tetap diam-diam
 * fetch ulang di belakang layar (silent reload) supaya datanya tidak basi — pola yang sama persis
 * dengan "silent reload" yang sudah dipakai untuk polling di ketiga komponen ini.
 */
const cache = new Map<string, unknown>();

export function getViewCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setViewCache<T>(key: string, value: T): void {
  cache.set(key, value);
}
