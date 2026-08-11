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
