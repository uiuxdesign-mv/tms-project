/**
 * Proteksi CSRF (Fase 7) — pola double-submit cookie.
 *
 * Kenapa ini perlu meski sesi sudah httpOnly + SameSite=Lax: SameSite=Lax masih mengizinkan
 * navigasi top-level GET cross-site, dan tidak ada lapisan kedua kalau suatu saat ada endpoint
 * yang longgar menerima Content-Type sederhana. Aplikasi lama (PHP) mewajibkan token CSRF
 * eksplisit di setiap POST (lihat README Iterasi 4) — pola ini mereplikasi jaminan yang sama:
 * proxy.ts men-generate token acak dan menyimpannya di cookie yang BISA dibaca JavaScript
 * (bukan httpOnly, karena client perlu membacanya untuk mengirim ulang sebagai header),
 * lalu setiap request state-changing (POST/PUT/PATCH/DELETE) ke /api/* wajib menyertakan
 * header x-csrf-token yang nilainya sama persis dengan cookie. Penyerang cross-site tidak bisa
 * membaca cookie milik origin lain, jadi tidak bisa membuat header yang cocok.
 */

export const CSRF_COOKIE_NAME = 'tms_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
