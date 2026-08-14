import { SignJWT, jwtVerify } from 'jose';

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET belum diset di environment variable.');
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  canAssignOthers: boolean;
  /** true kalau role user ini ditandai "Pemimpin" di Master Role (permintaan user, fitur Leader
   *  Role) — Leader tidak bisa ditugaskan task oleh siapa pun (termasuk dirinya sendiri), boleh
   *  menugaskan ke semua user kecuali Admin, dan boleh melihat SELURUH task user lain tapi
   *  murni view-only (lihat src/lib/models/tasks.ts canViewTask/canManageTask/canAssignToOthers). */
  isLeader: boolean;
  /** true kalau user ini wajib ganti password sebelum bisa memakai aplikasi (mis. baru dibuat lewat Import CSV
   * dengan password acak). Dicek proxy.ts untuk memaksa redirect ke /change-password. */
  mustChangePassword: boolean;
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = 'tms_session';
