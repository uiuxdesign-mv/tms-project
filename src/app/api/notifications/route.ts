import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { getNotificationsForUser } from '@/lib/models/notifications';

/**
 * List notifikasi milik user yang login (permintaan user Round 5, poin 3 & 4) — dipakai bell
 * notifikasi di header (notification-bell.tsx), di-poll berkala (lihat use-polling.ts) supaya
 * penunjukan tugas baru muncul tanpa user perlu refresh halaman.
 *
 * Selalu baca langsung dari Google Sheets (useCache:false) — sama alasannya dengan GET
 * /api/tasks: endpoint ini di-poll berkala jadi HARUS selalu terbaru, kalau lewat cache 30 detik
 * yang tidak konsisten antar instance serverless, notifikasi baru bisa "telat" muncul.
 * Dibatasi 30 item terbaru supaya payload tetap ringan (dropdown cuma perlu yang terbaru, bukan
 * seluruh riwayat).
 */
export async function GET() {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  try {
    const all = await getNotificationsForUser(session.userId, { useCache: false });
    const unreadCount = all.filter((n) => !n.read_at).length;
    return NextResponse.json({ data: all.slice(0, 30), unreadCount });
  } catch (err) {
    console.error('GET /api/notifications gagal:', err);
    // Fail-soft: bell notifikasi bukan fitur inti, kegagalan sesaat tidak boleh terlihat seperti
    // error besar ke user — balas daftar kosong alih-alih 500 supaya UI tetap tenang, silent-retry
    // lewat polling berikutnya.
    return NextResponse.json({ data: [], unreadCount: 0 });
  }
}
