import bcrypt from 'bcryptjs';
import * as SheetTable from '@/lib/google/sheet-table';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role_id: string;
  employment_type_id: string;
  can_assign_others: string; // "Ya" | "Tidak"
  status: string; // "Active" | "Inactive"
  must_change_password: string; // "Ya" | "Tidak" — dipaksa Ya untuk user hasil Import CSV (password acak)
  phone: string; // Fase 8 — self-service Profile
  department: string; // Fase 8 — self-service Profile
};

/** Buat password acak yang cukup kuat untuk dipakai sebagai password sementara (Import CSV User). */
export function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url'); // ~12 karakter, alfanumerik + -_
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const row = await SheetTable.findOne('users', (r) => r.email.toLowerCase() === email.toLowerCase());
  return row as UserRow | undefined;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const row = await SheetTable.findById('users', id);
  return row as UserRow | undefined;
}

export async function getAllUsers(): Promise<UserRow[]> {
  const rows = await SheetTable.getAll('users');
  return rows as UserRow[];
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/** Buang password_hash sebelum data user dikirim ke client — jangan pernah expose hash ke frontend. */
export function omitPasswordHash(row: SheetTable.SheetRow): SheetTable.SheetRow {
  const clone = { ...row };
  delete clone.password_hash;
  return clone;
}
