import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { getVisibleEnrichedTasks } from '@/lib/models/reports';

/**
 * Data mentah untuk halaman Report — task yang boleh dilihat session ini, sudah di-enrich
 * dengan nama relasi. Filter, ringkasan (summary), dan export CSV semuanya dihitung di client
 * dari data ini (jumlah task relatif kecil, tidak perlu bolak-balik ke server tiap ganti filter).
 *
 * Fase 7: sebelumnya hanya requireAuth() (siapa pun yang login otomatis bisa akses Report) —
 * sekarang digerbang requirePermission('report', 'view') meniru menu_key `report` di aplikasi
 * lama.
 */
export async function GET() {
  const guard = await requirePermission('report', 'view');
  if ('error' in guard) return guard.error;

  // Bugfix (permintaan user, "Unexpected end of JSON input"): dibungkus try/catch — lihat
  // catatan lengkap di GET /api/master/[entity]/options.
  try {
    const tasks = await getVisibleEnrichedTasks(guard.session);
    return NextResponse.json({ data: tasks });
  } catch (err) {
    console.error('GET /api/reports/tasks gagal:', err);
    return NextResponse.json(
      { error: 'Gagal memuat data Report dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}
