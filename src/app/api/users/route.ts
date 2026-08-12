import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import * as SheetTable from '@/lib/google/sheet-table';
import { hashPassword, findUserByEmail, omitPasswordHash, generateTemporaryPassword } from '@/lib/models/users';
import { findRoleById } from '@/lib/models/roles';
import { getCanAssignMap } from '@/lib/models/employment-types';
import { logAction } from '@/lib/models/audit-log';
import { uploadUserPhoto, extractPhotoFile } from '@/lib/models/user-photo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const rows = await SheetTable.getAll('users');
  return NextResponse.json({ data: rows.map(omitPasswordHash) });
}

/** Body request bisa JSON biasa, atau multipart/form-data kalau menyertakan foto (Fase 11, Add User). */
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

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { body, photoFile } = await parseRequestBody(req);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  // Import CSV (Fase 7) minta password acak dibuatkan server, bukan dikirim dari CSV — supaya
  // password tidak pernah tersimpan sebagai teks biasa di file CSV. User hasil import wajib
  // ganti password ini saat login pertama (lihat must_change_password / /change-password).
  const autoGeneratePassword = body.autoGeneratePassword === true;
  const generatedPassword = autoGeneratePassword ? generateTemporaryPassword() : null;

  const errors: Record<string, string> = {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const password = autoGeneratePassword ? generatedPassword! : String(body.password || '');
  const roleId = String(body.role_id || '');
  const status = String(body.status || 'Active');

  if (!name) errors.name = 'Nama wajib diisi.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'Email tidak valid.';
  if (!autoGeneratePassword && (!password || password.length < 8)) errors.password = 'Password minimal 8 karakter.';
  if (!roleId) errors.role_id = 'Role wajib dipilih.';

  const role = roleId ? await findRoleById(roleId) : undefined;
  if (roleId && !role) errors.role_id = 'Role tidak ditemukan.';

  // Employment Type & can_assign_others SELALU dihitung ulang di server dari data
  // yang tersimpan (bukan sekadar dipercaya dari body request), supaya user tidak
  // bisa memberi dirinya sendiri hak "boleh menugaskan ke user lain" lewat request
  // yang dimanipulasi.
  let employmentTypeId = '';
  let canAssignOthers = 'Tidak';
  if (role && role.role_key !== 'admin') {
    employmentTypeId = String(body.employment_type_id || '');
    if (!employmentTypeId) {
      errors.employment_type_id = 'Tipe kepegawaian wajib dipilih.';
    } else {
      const canAssignMap = await getCanAssignMap();
      const eligible = canAssignMap[employmentTypeId] || false;
      if (eligible && body.can_assign_others !== 'Ya' && body.can_assign_others !== 'Tidak') {
        errors.can_assign_others = 'Wajib pilih Ya/Tidak.';
      }
      canAssignOthers = eligible && body.can_assign_others === 'Ya' ? 'Ya' : 'Tidak';
    }
  }

  if (!errors.email) {
    const existing = await findUserByEmail(email);
    if (existing) errors.email = 'Email sudah dipakai user lain.';
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: errors }, { status: 422 });
  }

  const passwordHash = await hashPassword(password);

  // Foto (Fase 11) — upload ke Drive dulu SEBELUM insertRow, supaya kalau upload gagal (mis. jenis
  // file tidak didukung / kebesaran), baris user belum sempat dibuat sama sekali.
  let photoDriveFileId = '';
  if (photoFile) {
    const uploadResult = await uploadUserPhoto(photoFile.buffer, photoFile.originalName);
    if (!uploadResult.ok) {
      return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: { photo: uploadResult.error } }, { status: 422 });
    }
    photoDriveFileId = uploadResult.driveFileId;
  }

  const row = await SheetTable.insertRow('users', {
    name,
    email,
    password_hash: passwordHash,
    role_id: roleId,
    employment_type_id: employmentTypeId,
    can_assign_others: canAssignOthers,
    status,
    must_change_password: autoGeneratePassword ? 'Ya' : 'Tidak',
    phone: String(body.phone ?? '').trim(),
    department: String(body.department ?? '').trim(),
    photo_url: photoDriveFileId,
  });

  await logAction({
    actorUserId: guard.session.userId,
    actorName: guard.session.name,
    action: 'create',
    entityType: 'users',
    entityId: row.id,
    entityLabel: row.name || row.email,
  });

  // generatedPassword HANYA dikembalikan sekali di response ini (tidak pernah disimpan sebagai
  // plaintext) — dipakai halaman Import CSV untuk ditampilkan ke admin supaya bisa disampaikan
  // ke user yang bersangkutan secara manual.
  return NextResponse.json(
    { data: omitPasswordHash(row), generatedPassword: generatedPassword || undefined },
    { status: 201 }
  );
}
