import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEntityConfig } from '@/lib/master-data/config';
import { resolveFieldOptions } from '@/lib/master-data/options';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: 'Entity tidak ditemukan.' }, { status: 404 });

  const guard = await requirePermission(`master-${entity}`, 'view');
  if ('error' in guard) return guard.error;

  // Bugfix (permintaan user): endpoint ini sebelumnya TIDAK dibungkus try/catch — kalau Google
  // Sheets API gagal sesaat (rate limit 429, network hiccup), exception yang tidak tertangani
  // membuat Next.js/Vercel mengembalikan respons error tanpa body JSON yang valid. Di client,
  // `res.json()` lalu gagal dengan "Unexpected end of JSON input" — pesan mentah browser yang
  // membingungkan, bukan pesan error yang jelas. Sekarang ditangkap & dikembalikan sebagai JSON
  // 503 yang jelas, sama seperti pola di GET /api/tasks.
  try {
    const options = await resolveFieldOptions(config);
    return NextResponse.json({ data: options });
  } catch (err) {
    console.error(`GET /api/master/${entity}/options gagal:`, err);
    return NextResponse.json(
      { error: 'Gagal memuat opsi dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}
