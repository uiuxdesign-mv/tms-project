/**
 * Cache in-memory sederhana dengan TTL, untuk mengurangi jumlah panggilan
 * ke Google Sheets API (kuota: 300 read/menit per project, 60/menit per user).
 *
 * Catatan: di Vercel serverless, memory ini hanya bertahan selama instance
 * masih "warm" (biasanya beberapa menit setelah request terakhir), jadi ini
 * bukan cache yang 100% konsisten lintas request. Untuk skala lebih besar,
 * ganti implementasi ini dengan Redis/Upstash tanpa mengubah kode pemanggil
 * (getAll/findById dkk di sheet-table.ts).
 */

type CacheEntry<T> = { data: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(key: string): void {
  store.delete(key);
}
