import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import * as SheetTable from '@/lib/google/sheet-table';
import { hashPassword, verifyPassword } from '@/lib/models/users';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

/**
 * Ganti password sendiri (self-service minimal) — dipakai user yang must_change_password=Ya
 * (dibuat lewat Import CSV dengan password acak, lihat Fase 7) untuk mengganti password
 * sementara mereka dengan password pilihan sendiri, tanpa perlu admin.
 * Wajib tahu password lama (sama seperti ProfileController::updatePassword() di aplikasi lama).
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');

  if (!currentPassword) {
    return NextResponse.json(
      { error: 'Validasi gagal.', fieldErrors: { currentPassword: 'Password saat ini wajib diisi.' } },
      { status: 422 }
    );
  }
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Validasi gagal.', fieldErrors: { newPassword: 'Password baru minimal 8 karakter.' } },
      { status: 422 }
    );
  }

  const user = await SheetTable.findById('users', session.userId);
  if (!user) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    return NextResponse.json(
      { error: 'Validasi gagal.', fieldErrors: { currentPassword: 'Password saat ini salah.' } },
      { status: 422 }
    );
  }

  const newHash = await hashPassword(newPassword);
  await SheetTable.updateRow('users', session.userId, {
    password_hash: newHash,
    must_change_password: 'Tidak',
  });

  // Sesi JWT bersifat stateless (claim mustChangePassword sudah di-bake saat login) — terbitkan
  // ulang token supaya proxy.ts langsung berhenti memaksa redirect ke /change-password tanpa
  // perlu logout/login manual.
  const newToken = await createSessionToken({ ...session, mustChangePassword: false });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return res;
}
