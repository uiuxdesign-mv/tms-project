import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import * as SheetTable from '@/lib/google/sheet-table';
import { hashPassword, findUserByEmail, omitPasswordHash } from '@/lib/models/users';
import { findRoleById } from '@/lib/models/roles';
import { getCanAssignMap } from '@/lib/models/employment-types';
import { logAction } from '@/lib/models/audit-log';
import { uploadUserPhoto, deleteUserPhoto, extractPhotoFile } from '@/lib/models/user-photo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sama seperti di route.ts (POST) — body bisa JSON biasa atau multipart/form-data kalau ganti foto. */
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { id } = await ctx.params;

  const { body, photoFile } = await parseRequestBody(req);
  if (!body) return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });

  const existing = await SheetTable.findById('users', id);
  if (!existing) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });

  const errors: Record<string, string> = {};
  const name = String(body.name ?? existing.name).trim();
  const email = String(body.email ?? existing.email).trim();
  const roleId = String(body.role_id ?? existing.role_id);
  const status = String(body.status ?? existing.status);

  if (!name) errors.name = 'Nama wajib diisi.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'Email tidak valid.';
  if (!roleId) errors.role_id = 'Role wajib dipilih.';

  if (!errors.email && email.toLowerCase() !== existing.email.toLowerCase()) {
    const dupe = await findUserByEmail(email);
    if (dupe) errors.email = 'Email sudah dipakai user lain.';
  }

  const role = roleId ? await findRoleById(roleId) : undefined;
  if (roleId && !role) errors.role_id = 'Role tidak ditemukan.';

  let employmentTypeId = '';
  let canAssignOthers = 'Tidak';
  if (role && role.role_key !== 'admin') {
    employmentTypeId = String(body.employment_type_id ?? existing.employment_type_id ?? '');
    if (!employmentTypeId) {
      errors.employment_type_id = 'Tipe kepegawaian wajib dipilih.';
    } else {
      const canAssignMap = await getCanAssignMap();
      const eligible = canAssignMap[employmentTypeId] || false;
      const requested = body.can_assign_others ?? existing.can_assign_others;
      if (eligible && requested !== 'Ya' && requested !== 'Tidak') {
        errors.can_assign_others = 'Wajib pilih Ya/Tidak.';
      }
      canAssignOthers = eligible && requested === 'Ya' ? 'Ya' : 'Tidak';
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validasi gagal.', fieldErrors: errors }, { status: 422 });
  }

  const patch: Record<string, string> = {
    name,
    email,
    role_id: roleId,
    employment_type_id: employmentTypeId,
    can_assign_others: canAssignOthers,
    status,
    // Fase 8: phone/department juga bisa diisi Admin lewat Master Users, selain lewat
    // self-service Profile user sendiri (/api/profile).
    phone: String(body.phone ?? existing.phone ?? ''),
    department: String(body.department ?? existing.department ?? ''),
  };

  // Foto (Fase 11) — kalau Edit User menyertakan foto baru, upload dulu SEBELUM updateRow, lalu
  // hapus foto lama dari Drive (best-effort, tidak menggagalkan alur utama kalau gagal).
  // Fase 17: atau kalau user memilih "Hapus Foto" (remove_photo), cukup hapus foto lama dari Drive
  // dan kosongkan photo_url — tanpa foto baru menggantikannya.
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

  if (body.password) {
    const password = String(body.password);
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Validasi gagal.', fieldErrors: { password: 'Password minimal 8 karakter.' } },
        { status: 422 }
      );
    }
    patch.password_hash = await hashPassword(password);
  }

  const updated = await SheetTable.updateRow('users', id, patch);

  await logAction({
    actorUserId: guard.session.userId,
    actorName: guard.session.name,
    action: 'update',
    entityType: 'users',
    entityId: id,
    entityLabel: updated?.name || updated?.email || id,
  });

  return NextResponse.json({ data: omitPasswordHash(updated!) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { id } = await ctx.params;

  if (guard.session.userId === id) {
    return NextResponse.json({ error: 'Tidak bisa menghapus akun Anda sendiri.' }, { status: 400 });
  }

  const existing = await SheetTable.findById('users', id);

  await SheetTable.softDeleteRow('users', id);

  await logAction({
    actorUserId: guard.session.userId,
    actorName: guard.session.name,
    action: 'delete',
    entityType: 'users',
    entityId: id,
    entityLabel: existing?.name || existing?.email || id,
  });

  return NextResponse.json({ ok: true });
}
