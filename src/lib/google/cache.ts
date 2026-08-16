/**
 * Cache dua-lapis untuk mengurangi jumlah panggilan ke Google Sheets API (kuota: 300 read/menit
 * per project, 60/menit per service account).
 *
 * Perbaikan (Round 24 — permintaan user, "loading masih lama & bimbing pasang Upstash Redis"):
 * SEBELUMNYA cache ini murni in-memory (1 `Map` per proses) — cepat, tapi TIDAK dibagikan antar
 * instance server Vercel. Setiap kali instance serverless "bangun tidur" (cold start) atau
 * permintaan kebetulan dilayani instance lain, cache-nya kosong lagi dari nol, walau belum lewat
 * TTL-nya sama sekali (lihat diskusi panjang dengan user soal kenapa loading masih terasa lambat
 * meski TTL sudah diatur). Sekarang: KALAU env var `UPSTASH_REDIS_REST_URL` +
 * `UPSTASH_REDIS_REST_TOKEN` (atau `KV_REST_API_URL`/`KV_REST_API_TOKEN` — nama yang dipakai kalau
 * Upstash dihubungkan lewat integrasi Vercel Marketplace) sudah diset, cache dipindah ke Upstash
 * Redis — dibagikan SEMUA instance, jadi TTL yang diatur di sheet-table.ts (cacheTtlFor) benar-benar
 * berlaku secara aplikasi, bukan per-instance lagi.
 *
 * PENTING — desain aman/fail-open, supaya Upstash TIDAK PERNAH bisa menjatuhkan aplikasi:
 * 1. Kalau env var-nya belum diset sama sekali (Anda belum pasang Upstash), fungsi-fungsi di sini
 *    otomatis jalan seperti SEBELUM perubahan ini — cache in-memory biasa, TIDAK ada bedanya sama
 *    sekali secara perilaku. Aman dipasang & di-deploy kapan pun, tidak perlu menunggu Upstash siap.
 * 2. Kalau env var-nya SUDAH diset tapi panggilan ke Upstash gagal (jaringan, kredensial salah,
 *    Upstash sedang gangguan, dll), setiap fungsi di sini menangkap errornya sendiri dan
 *    memperlakukannya sebagai "cache kosong" — pemanggilnya (sheet-table.ts) otomatis baca
 *    langsung ke Google Sheets, PERSIS seperti kalau cache-nya memang belum terisi. Tidak pernah
 *    melempar error ke atas.
 * 3. ini MURNI lapisan cache (salinan sementara) — Google Sheets tetap satu-satunya sumber data
 *    asli. Kalaupun Upstash bermasalah total, paling buruk yang terjadi adalah aplikasi jadi
 *    seolah-olah tidak pernah pasang cache sama sekali (seperti sebelum Round 22), BUKAN kehilangan
 *    atau merusak data apa pun.
 *
 * Kenapa fungsi-fungsi di sini sekarang async (dulu sinkron)? Karena panggilan ke Upstash lewat
 * jaringan (REST API) tidak mungkin instan seperti baca/tulis `Map` di memori. Pemanggilnya
 * (getAll/insertRow/updateRow di sheet-table.ts) sudah selalu memanggil fungsi-fungsi ini di dalam
 * fungsi `async` yang di-`await`, jadi perubahan ini tidak mengubah cara pakainya sama sekali,
 * cukup tambah `await` di titik panggilnya masing-masing.
 */

import { Redis } from '@upstash/redis';
import { after } from 'next/server';

type CacheEntry<T> = { data: T; expiresAt: number };

// --- Fallback: cache in-memory sederhana, dipakai kalau Upstash belum/tidak dikonfigurasi, atau
// sedang tidak bisa dihubungi. Ini PERSIS implementasi lama sebelum Round 24.
const memoryStore = new Map<string, CacheEntry<unknown>>();

function getFromMemory<T>(key: string): T | undefined {
  const entry = memoryStore.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return undefined;
  }
  return entry.data as T;
}

// --- Upstash Redis (opsional): hanya aktif kalau kredensialnya ada di env var. Sengaja dicek
// sendiri di sini (bukan cuma pakai `Redis.fromEnv()` polos) supaya kalau belum diset, kita tidak
// bahkan mencoba membuat client-nya sama sekali — tidak ada log peringatan yang membingungkan di
// server, dan jalur kodenya jelas 100% balik ke in-memory tanpa jejak Upstash sama sekali.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis: Redis | null =
  UPSTASH_URL && UPSTASH_TOKEN ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) : null;

// Batas waktu wajar untuk 1 panggilan ke Upstash — kalau Upstash sedang lambat merespons lebih
// lama dari ini, lebih baik anggap gagal & langsung lanjut baca ke Google Sheets, daripada bikin
// user menunggu LEBIH LAMA dari kondisi "tanpa cache sama sekali" gara-gara cache-nya sendiri yang
// lambat.
const REDIS_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Upstash Redis timeout (${label}) setelah ${REDIS_TIMEOUT_MS}ms`)), REDIS_TIMEOUT_MS);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function getCached<T>(key: string): Promise<T | undefined> {
  if (!redis) return getFromMemory<T>(key);

  try {
    // TTL-nya sudah ditangani NATIVE oleh Redis sendiri (lihat `ex` di setCached) — begitu lewat
    // waktunya, Redis otomatis menganggap key-nya tidak ada (balas null), jadi di sini tidak perlu
    // simpan/cek expiresAt manual lagi seperti versi in-memory.
    const result = await withTimeout(redis.get<T>(key), `GET ${key}`);
    return result === null || result === undefined ? undefined : result;
  } catch (e) {
    console.error(`[cache] Gagal baca dari Upstash Redis untuk key "${key}" — dianggap cache kosong, lanjut baca langsung ke Google Sheets:`, e);
    return undefined;
  }
}

export async function setCached<T>(key: string, data: T, ttlMs: number): Promise<void> {
  if (!redis) {
    memoryStore.set(key, { data, expiresAt: Date.now() + ttlMs });
    return;
  }

  try {
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await withTimeout(redis.set(key, data, { ex: ttlSeconds }), `SET ${key}`);
  } catch (e) {
    // Gagal simpan ke cache BUKAN kegagalan fatal — cuma berarti permintaan BERIKUTNYA untuk data
    // ini juga akan baca langsung ke Google Sheets lagi (sama seperti kalau cache-nya memang belum
    // terisi), bukan kehilangan data apa pun.
    console.error(`[cache] Gagal simpan ke Upstash Redis untuk key "${key}" — data kali ini tidak ke-cache:`, e);
  }
}

export async function invalidateCache(key: string): Promise<void> {
  if (!redis) {
    memoryStore.delete(key);
    return;
  }

  try {
    // SENGAJA di-`await` langsung (bukan lewat after()/fire-and-forget) — ini dipanggil tepat
    // setelah insertRow/updateRow menulis ke Google Sheets, SEBELUM responsnya dibalas ke client.
    // Kalau penghapusan cache ini ditunda sampai setelah respons terkirim, ada risiko balapan
    // (race condition): client langsung memuat ulang data begitu menerima respons "berhasil", dan
    // permintaan muat-ulang itu bisa saja tiba SEBELUM cache sempat dihapus — user melihat data
    // LAMA walau baru saja menyimpan perubahan. Menunggu penghapusan selesai dulu di sini menutup
    // celah itu, konsisten dengan jaminan "user lain langsung lihat perubahan" yang sudah dibahas.
    await withTimeout(redis.del(key), `DEL ${key}`);
  } catch (e) {
    // Fail-open: kalau penghapusan cache gagal (mis. Upstash sedang gangguan JUSTRU di momen ini),
    // data di Google Sheets TETAP tersimpan dengan benar (penulisannya sudah selesai duluan) — yang
    // berisiko basi cuma TAMPILAN di instance lain, paling lama sampai TTL cache-nya habis sendiri
    // (maksimal 30 detik/2 menit tergantung jenis datanya, lihat cacheTtlFor di sheet-table.ts).
    console.error(`[cache] Gagal hapus cache Upstash Redis untuk key "${key}" — data di Google Sheets sudah tersimpan aman, tapi tampilan di instance lain mungkin baru ter-update setelah cache kadaluwarsa sendiri:`, e);
  }
}

/**
 * Populate cache di LATAR BELAKANG (dijadwalkan lewat `next/server`'s `after()`) — dipakai getAll()
 * di sheet-table.ts supaya penulisan ke cache TIDAK menambah waktu tunggu respons yang sedang
 * dikirim ke user (data yang mau ditampilkan sudah di tangan, cache cuma untuk permintaan
 * BERIKUTNYA). `after()` memastikan pekerjaan latar belakang ini tetap dijalankan sampai selesai
 * oleh platform (Vercel `waitUntil`), tidak dimatikan paksa begitu respons terkirim.
 *
 * Dibungkus try/catch terpisah untuk after() sendiri: after() cuma valid dipanggil di dalam siklus
 * request Next.js (Server Component/Route Handler/Proxy) — kalau suatu saat getAll() dipanggil dari
 * luar konteks itu (mis. script CLI internal di masa depan), after() akan melempar error. Daripada
 * itu ikut menjatuhkan pembacaan data, di sini cukup fallback ke penulisan cache langsung (biasa),
 * tanpa penundaan.
 */
export function scheduleCacheWrite<T>(key: string, data: T, ttlMs: number): void {
  try {
    after(() => setCached(key, data, ttlMs));
  } catch {
    void setCached(key, data, ttlMs);
  }
}
