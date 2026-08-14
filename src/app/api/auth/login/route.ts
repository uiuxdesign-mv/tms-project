import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword } from '@/lib/models/users';
import { findRoleById, isAdminRole, isLeaderRole } from '@/lib/models/roles';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email dan password wajib diisi.' }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || user.status !== 'Active') {
    return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
  }

  // Bugfix (permintaan user, item speed): verifikasi password (bcrypt, CPU-bound) & lookup role
  // (panggilan Google Sheets) SALING INDEPENDEN — sebelumnya berurutan, sekarang berjalan
  // bersamaan supaya proses login tidak menunggu keduanya secara berurutan.
  const [valid, role] = await Promise.all([
    verifyPassword(password, user.password_hash),
    user.role_id ? findRoleById(user.role_id) : Promise.resolve(undefined),
  ]);
  if (!valid) {
    return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
  }

  const roleKey = role?.role_key || '';
  // Perbaikan (permintaan user): "admin" sekarang data-driven — role LAIN selain role_key bawaan
  // sistem 'admin' juga bisa ditandai is_admin="Ya" di Master Role dan dapat hak Admin PENUH, 100%
  // identik di seluruh aplikasi. isAdminRole()/isLeaderRole() dihitung ulang di server dari data
  // role saat ini, TIDAK PERNAH dipercaya dari client.
  const isAdmin = isAdminRole(role);

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    roleId: user.role_id || '',
    roleKey,
    roleName: role?.role_name || '',
    canAssignOthers: isAdmin ? true : user.can_assign_others === 'Ya',
    isAdmin,
    // Fitur Leader Role (permintaan user): dihitung ulang di server dari data role saat login,
    // bukan dipercaya dari client — sama seperti canAssignOthers di atas. isLeaderRole() sudah
    // memaksa false kalau role ini juga is_admin="Ya" (mutually exclusive).
    isLeader: isLeaderRole(role),
    mustChangePassword: user.must_change_password === 'Ya',
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 jam
  });
  return res;
}
