import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { markNotificationRead } from '@/lib/models/notifications';

/** Tandai 1 notifikasi sudah dibaca (klik item di dropdown bell). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;
  const { id } = await ctx.params;

  const ok = await markNotificationRead(session.userId, id);
  if (!ok) return NextResponse.json({ error: 'Notifikasi tidak ditemukan.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
