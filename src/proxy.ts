import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, generateCsrfToken } from '@/lib/auth/csrf';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Proxy ini menjaga dua hal:
 * 1. Halaman (page routes) — redirect ke /login kalau belum ada sesi, redirect balik ke
 *    /dashboard kalau sudah login tapi buka /login, dan paksa ke /change-password kalau
 *    sesi menandai mustChangePassword (mis. user baru dari Import CSV dengan password acak).
 *    Route API (/api/*) SENGAJA tidak diredirect ke halaman manapun untuk hal ini — masing-masing
 *    route API menangani auth-nya sendiri lewat requireAuth()/requireAdmin()/requirePermission()
 *    dan membalas 401/403 JSON, supaya fetch() di client menerima error yang jelas, bukan HTML
 *    halaman lain sebagai "response sukses".
 * 2. Proteksi CSRF (Fase 7) untuk /api/* — lihat src/lib/auth/csrf.ts untuk penjelasan pola
 *    double-submit cookie yang dipakai. Ini berlaku untuk SEMUA request /api/*, termasuk yang
 *    belum login (mis. POST /api/auth/login), karena cookie CSRF di-set untuk siapa saja yang
 *    membuka halaman manapun (lihat di bawah).
 */
export async function proxy(req: NextRequest) {
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
  const existingCsrfCookie = req.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (isApiRoute) {
    if (MUTATING_METHODS.has(req.method)) {
      const headerToken = req.headers.get(CSRF_HEADER_NAME);
      if (!existingCsrfCookie || !headerToken || headerToken !== existingCsrfCookie) {
        return NextResponse.json(
          { error: 'Token keamanan (CSRF) tidak valid atau kedaluwarsa. Muat ulang halaman lalu coba lagi.' },
          { status: 403 }
        );
      }
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
  const isChangePasswordRoute = req.nextUrl.pathname.startsWith('/change-password');

  let response: NextResponse;

  if (!session) {
    response = isAuthRoute ? NextResponse.next() : redirectTo(req, '/login');
  } else if (isAuthRoute) {
    response = redirectTo(req, '/dashboard');
  } else if (session.mustChangePassword && !isChangePasswordRoute) {
    response = redirectTo(req, '/change-password');
  } else if (!session.mustChangePassword && isChangePasswordRoute) {
    response = redirectTo(req, '/dashboard');
  } else {
    response = NextResponse.next();
  }

  // Pastikan setiap pengunjung (login atau belum) punya cookie CSRF, supaya token sudah
  // tersedia sebelum request POST pertama (mis. submit form login).
  if (!existingCsrfCookie) {
    response.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  return response;
}

function redirectTo(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
