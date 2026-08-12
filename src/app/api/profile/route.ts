import { NextRequest, NextResponse, after } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import * as SheetTable from '@/lib/google/sheet-table';
import { findUserByEmail, omitPasswordHash } from '@/lib/models/users';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { logAction } from '@/lib/models/audit-log';
import { uploadUserPhoto, deleteUserPhoto, extractPhotoFile } from '@/lib/models/user-photo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fase 17 (permintaan user): self-service Profile sekarang juga bisa upload/ganti/hapus foto
 * profil sendiri (sebelumnya sengaja dikecualikan — lihat catatan lama di ProfileView). Body bisa
 * JSON biasa (tanpa perubahan foto) atau multipart/form-data (menyertakan foto baru, atau flag
 * remove_photo) — sama polanya dengan /api/users & /api/users/[id].
 */
async function parseRequestBody(req: NextRequest): Promise<{ body: Record<string, unknown>; photoFile: { buffer: Buffer; originalName: string } | null }> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const body: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (key === 'photo') continue;
      body[key] = value;
    }
    const photoFile = await extractPhotoFile(form);
    return { body, photoFile };
  }
  const body = (await req.json().catch(() => null)) || {};
  return { body, photoFile: null };
}

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

  // Bugfix (permintaan user, "Unexpected end of JSON input"): dibungkus try/catch — lihat
  // catatan lengkap di GET /api/master/[entity]/options.
  try {
    const user = await SheetTable.findById('users', guard.session.userId);
    if (!user) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
    return NextResponse.json({ data: omitPasswordHash(user) });
  } catch (err) {
    console.error('GET /api/profile gagal:', err);
    return NextResponse.json(
      { error: 'Gagal memuat data profil dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const { body, photoFile } = await parseRequestBody(req);
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

  const patch: Record<string, string> = { name, email, phone, department };

  // Foto (Fase 17) — upload foto baru (sudah di-crop di client) SEBELUM updateRow, lalu hapus foto
  // lama dari Drive (best-effort). Kalau bukan foto baru tapi flag remove_photo dikirim, cukup
  // hapus foto lama & kosongkan photo_url.
  if (photoFile) {
    const uploadResult = await uploadUserPhoto(photoFile.buffer, photoFile.originalName);
    if (!uploadResult.ok) {
      return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: { photo: uploadResult.error } }, { status: 422 });
    }
    patch.photo_url = uploadResult.driveFileId;
    if (existing.photo_url) await deleteUserPhoto(existing.photo_url).catch(() => undefined);
  } else if (String(body.remove_photo ?? '') === '1' || body.remove_photo === 'true') {
    if (existing.photo_url) await deleteUserPhoto(existing.photo_url).catch(() => undefined);
    patch.photo_url = '';
  }

  const updated = await SheetTable.updateRow('users', session.userId, patch);

  after(() =>
    logAction({
      actorUserId: session.userId,
      actorName: name,
      action: 'update',
      entityType: 'users',
      entityId: session.userId,
      entityLabel: `${name} (self-service Profile)`,
    })
  );

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
