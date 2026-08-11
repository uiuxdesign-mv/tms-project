import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getConsentUrl } from '@/lib/google/drive-oauth';

/**
 * Fase 9 — langkah 1 dari alur one-time setup OAuth Google Drive (dipakai admin sekali di awal,
 * bukan dipakai user biasa). Redirect ke halaman consent Google; setelah admin klik "Allow",
 * Google akan redirect balik ke /api/auth/google-drive/callback dengan sebuah `code`.
 */
export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    const url = getConsentUrl();
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gagal membuat URL consent Google.' },
      { status: 500 }
    );
  }
}
