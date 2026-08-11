import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import * as SheetTable from '@/lib/google/sheet-table';
import { findUserByEmail, omitPasswordHash } from '@/lib/models/users';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { logAction } from '@/lib/models/audit-log';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Self-service Profile (Fase 8) — beda dari `/api/users/[id]` (admin-only, Fase 7 dikunci
 * `requireAdmin()`): endpoint ini cuma untuk user mengubah datanya SENDIRI (dari sesi JWT, bukan
 * dari body request — never-trust-client, sama pola dengan endpoint lain di app ini). Field
 * sensitif (role_id, employment_type_id, can_assign_others, status) TIDAK bisa diubah di sini,
 * tetap murni wewenang Admin lewat Master Users.
 */
export async function GET() {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;

  const user = await SheetTable.findById('users', guard.session.userId);
  if (!user) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
  return NextResponse.json({ data: omitPasswordHash(user) });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  const existing = await SheetTable.findById('users', session.userId);
  if (!existing) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });

  const errors: Record<string, string> = {};
  const name = String(body.name ?? existing.name).trim();
  const email = String(body.email ?? existing.email).trim();
  const phone = String(body.phone ?? existing.phone ?? '').trim();
  const department = String(body.department ?? existing.department ?? '').trim();

  if (!name) errors.name = 'Nama wajib diisi.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'Email tidak valid.';

  if (!errors.email && email.toLowerCase() !== existing.email.toLowerCase()) {
    const dupe = await findUserByEmail(email);
    if (dupe) errors.email = 'Email sudah dipakai user lain.';
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: errors }, { status: 422 });
  }

  const updated = await SheetTable.updateRow('users', session.userId, { name, email, phone, department });

  await logAction({
    actorUserId: session.userId,
    actorName: name,
    action: 'update',
    entityType: 'users',
    entityId: session.userId,
    entityLabel: `${name} (self-service Profile)`,
  });

  // name/email ikut dipakai di sesi JWT (ditampilkan di Dashboard/topbar) — terbitkan ulang token
  // supaya perubahan langsung terlihat tanpa perlu logout/login manual (pola sama seperti
  // change-password).
  const newToken = await createSessionToken({ ...session, name, email });
  const res = NextResponse.json({ data: omitPasswordHash(updated!) });
  res.cookies.set(SESSION_COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return res;
}
