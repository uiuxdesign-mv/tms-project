import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import * as SheetTable from '@/lib/google/sheet-table';
import { downloadAttachment } from '@/lib/google/drive-oauth';
import { sniffMimeType } from '@/lib/mime-sniff';

/**
 * Proxy foto profil user (Fase 11) — sama seperti proxy lampiran komentar, file foto di Drive
 * TIDAK PERNAH dibagikan lewat link publik. Bedanya dari lampiran komentar: foto profil tidak
 * sensitif secara visibilitas task, jadi cukup syarat "sudah login" (requireAuth), tidak perlu
 * requirePermission/canManageTask seperti lampiran.
 *
 * Kolom `photo_url` di sheet users sebenarnya menyimpan Drive file ID (bukan URL sungguhan) —
 * konsisten dengan pola attachment_drive_file_id di task_comments, cuma dinamai "url" karena itu
 * nama kolom yang sudah ada duluan di sheet. Mime type TIDAK disimpan terpisah (tidak ada kolom
 * untuk itu) — di-sniff ulang dari isi file setiap kali disajikan, sama seperti saat validasi upload.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { id } = await ctx.params;

  const user = await SheetTable.findById('users', id);
  if (!user || !user.photo_url) {
    return NextResponse.json({ error: 'Foto tidak ditemukan.' }, { status: 404 });
  }

  try {
    const buffer = await downloadAttachment(user.photo_url);
    const sniffed = sniffMimeType(buffer);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': sniffed?.mime || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Gagal mengambil foto dari Google Drive.' }, { status: 502 });
  }
}
