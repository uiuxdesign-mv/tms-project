import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword } from '@/lib/models/users';
import { findRoleById } from '@/lib/models/roles';
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
  const isAdmin = roleKey === 'admin';

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    roleId: user.role_id || '',
    roleKey,
    roleName: role?.role_name || '',
    canAssignOthers: isAdmin ? true : user.can_assign_others === 'Ya',
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
