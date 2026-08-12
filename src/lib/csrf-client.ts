'use client';

const CSRF_COOKIE_NAME = 'tms_csrf';

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Pengganti fetch() biasa untuk semua panggilan API dari client component — otomatis
 * menyertakan header x-csrf-token (dibaca dari cookie tms_csrf yang di-set proxy.ts).
 * Aman dipakai untuk GET juga (header diabaikan server untuk method non-mutating),
 * supaya semua pemanggilan konsisten dan tidak ada yang lupa dibungkus.
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-csrf-token', getCookie(CSRF_COOKIE_NAME));
  return fetch(input, { ...init, headers });
}

/**
 * Bugfix (permintaan user, "Failed to execute 'json' on 'Response': Unexpected end of JSON
 * input"): dulu SEMUA komponen langsung panggil `res.json()` tanpa pelindung — kalau server
 * mengembalikan respons yang bukan/bukan-lagi JSON valid (mis. function serverless timeout,
 * error gateway platform Vercel yang mengirim halaman HTML, koneksi terputus di tengah jalan),
 * `.json()` melempar SyntaxError mentah dari browser yang lolos sampai ke layar user apa
 * adanya — persis pesan teknis yang membingungkan itu.
 *
 * `parseJsonSafe()` menangkap kegagalan parse itu dan mengembalikan objek `{ error: ... }` yang
 * ramah, supaya kode pemanggil (yang sudah baca `json.error`) selalu dapat pesan Bahasa
 * Indonesia yang jelas, apa pun yang sebenarnya dikembalikan server.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {
      error: res.ok
        ? 'Respons server tidak valid. Coba muat ulang halaman.'
        : `Server mengalami gangguan (${res.status}). Coba beberapa saat lagi atau muat ulang halaman.`,
    };
  }
}
