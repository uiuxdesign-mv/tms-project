import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { markAllNotificationsRead } from '@/lib/models/notifications';

/** Tandai SEMUA notifikasi milik user yang login sebagai sudah dibaca (tombol "Tandai semua dibaca" di dropdown bell). */
export async function POST() {
  const guard = await requireAuth();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  await markAllNotificationsRead(session.userId);
  return NextResponse.json({ ok: true });
}
