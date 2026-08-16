/**
 * Loading UI Dashboard (Round 25 — permintaan user, video rekaman layar: "ketika klik menu
 * dashboard masih terjadi delay").
 *
 * AKAR MASALAH yang ditemukan dari video: Dashboard ini SEBELUMNYA tidak punya file `loading.tsx`
 * sama sekali (begitu juga Tasks/Report). Di App Router Next.js, kalau sebuah route TIDAK punya
 * `loading.tsx`, navigasi lewat <Link> itu BLOCKING — browser tetap menampilkan halaman LAMA
 * (termasuk alamat URL-nya) apa adanya, TANPA tanda apa pun bahwa aplikasi sedang bekerja, sampai
 * SELURUH data halaman baru (semua pemanggilan Google Sheets di page.tsx) benar-benar selesai —
 * baru semuanya "meloncat" berpindah sekaligus. Ini PERSIS pola yang terlihat di video user: layar
 * diam total selama beberapa detik setelah menu Dashboard diklik, lalu tiba-tiba seluruh halaman
 * (kartu ringkasan + chart) langsung muncul penuh dalam waktu bersamaan.
 *
 * Dashboard adalah halaman TERBERAT di aplikasi ini dari sisi jumlah spreadsheet Google Sheets
 * yang dibaca (bisa sampai lebih dari 10 file terpisah: menu_access, audit_log, tasks + 6 sheet
 * pendukungnya, users, task_comments, task_time_logs) — jadi walaupun sudah dioptimalkan berkali-
 * kali (Round 22/23/23b: paralelisasi Promise.all, cache Upstash Round 24), pada kondisi cache
 * dingin (server baru bangun / TTL cache baru habis / banyak user lain sedang memakai aplikasi
 * bersamaan) pengambilan datanya tetap bisa makan waktu beberapa detik — itu wajar untuk arsitektur
 * "Google Sheets sebagai database". Yang TIDAK wajar, dan inilah yang diperbaiki di sini, adalah
 * TIDAK ADANYA umpan balik visual sama sekali selama waktu itu, sehingga terasa seperti aplikasi
 * "macet"/tidak merespons klik, padahal sebenarnya sedang bekerja.
 *
 * Dengan file ini, Next.js langsung menampilkan kerangka (skeleton) di bawah dalam <100ms setelah
 * menu diklik — konten asli otomatis menggantikannya sendiri begitu data betul-betul siap (lihat
 * dokumentasi node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md).
 * TIDAK ADA perubahan logika/data apa pun di sini — file ini murni tampilan sementara.
 *
 * Struktur skeleton ini SENGAJA meniru bentuk asli DashboardView (header → 8 kartu ringkasan → 6
 * kartu chart → 4 kartu feed) supaya tidak ada "lompatan" tata letak yang mencolok saat konten
 * asli menggantikannya.
 */

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />;
}

function SummaryCardSkeleton() {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <Pulse className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="w-full space-y-2">
        <Pulse className="h-6 w-12" />
        <Pulse className="h-3 w-20" />
      </div>
    </div>
  );
}

function ChartCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <Pulse className="mb-4 h-4 w-32" />
      <div className="flex flex-1 items-center justify-center py-6">
        <Pulse className="h-40 w-40 rounded-full" />
      </div>
    </div>
  );
}

function FeedCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <Pulse className="mb-4 h-4 w-28" />
      <div className="space-y-3">
        <Pulse className="h-3.5 w-full" />
        <Pulse className="h-3.5 w-5/6" />
        <Pulse className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Pulse className="h-6 w-56" />
          <Pulse className="h-4 w-72" />
        </div>
        <Pulse className="h-9 w-64 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SummaryCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ChartCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <FeedCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
