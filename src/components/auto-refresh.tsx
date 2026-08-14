'use client';

import { useRouter } from 'next/navigation';
import { usePolling } from '@/lib/hooks/use-polling';

/**
 * Perbaikan (permintaan user Round 5, poin 2): Dashboard adalah Server Component murni (SSR,
 * data diambil sekali saat request) — tidak punya mekanisme reload client-side seperti
 * List/Kanban/Calendar (yang fetch datanya sendiri lewat GET /api/tasks). Daripada menulis ulang
 * Dashboard jadi client-fetched (perubahan besar & berisiko untuk halaman yang sudah berjalan),
 * komponen tak-terlihat ini memanggil `router.refresh()` Next.js secara berkala — itu meminta
 * Next.js me-render ULANG Server Component halaman saat ini di server (data terbaru dari Google
 * Sheets), lalu menukar hasilnya di client TANPA full page reload (state komponen client lain,
 * mis. scroll position, tetap terjaga). Sama pola polling & alasan intervalnya dengan
 * use-polling.ts (berhenti saat tab tidak aktif, supaya tidak boros kuota API).
 */
export default function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  usePolling(() => router.refresh(), intervalMs);
  return null;
}
