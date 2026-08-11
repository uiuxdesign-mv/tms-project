import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getAuditLog } from '@/lib/models/audit-log';

/**
 * Data mentah untuk halaman Audit Log — admin-only (bukan requirePermission, sama seperti
 * Menu Access, supaya jejak audit tidak bisa "diatur" hak aksesnya lewat sistem yang direkamnya
 * sendiri). Filter & pencarian dihitung di client dari data ini.
 */
export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const entries = await getAuditLog();
  return NextResponse.json({ data: entries });
}
