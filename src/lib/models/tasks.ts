import type { SheetRow } from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';

/**
 * Aturan visibilitas Task (Fase 7, DIPERBARUI — permintaan user, fitur Leader Role & pembatasan
 * visibilitas "Manager"):
 * - Admin melihat & mengelola semua task (tidak berubah).
 * - Role "Pemimpin" (session.isLeader, ditandai lewat Master Role) melihat SELURUH task milik
 *   user lain, TAPI murni view-only — tidak pernah bisa mengelola task siapa pun (lihat
 *   canManageTask di bawah), karena Pemimpin sendiri tidak pernah bisa ditugaskan task apa pun
 *   (lihat isNonAssignableRole di src/lib/models/roles.ts), jadi tidak punya "task miliknya sendiri".
 * - User dengan canAssignToOthers() (setara "Manager", dari flag Employment Type) HANYA melihat:
 *   (a) task yang assignee-nya dirinya sendiri (task miliknya, bebas dikelola), DAN
 *   (b) task yang dia sendiri tugaskan ke user lain (assigned_by === dirinya) — tapi ini
 *   VIEW-ONLY, tidak bisa diapa-apakan (lihat canManageTask). Sebelumnya Manager melihat &
 *   mengelola SEMUA task siapa pun — dipersempit sesuai permintaan user eksplisit.
 * - Role/user lain (setara "Member") HANYA melihat task yang assignee-nya (assigned_to) dirinya
 *   sendiri.
 */
export function canViewTask(session: SessionPayload, task: SheetRow): boolean {
  if (session.roleKey === 'admin') return true;
  if (session.isLeader) return true;
  if (task.assigned_to === session.userId) return true;
  // "dia sendiri tugaskan ke user lain" — assigned_by dirinya DAN benar-benar beda dari
  // assigned_to (bukan task lama yang assigned_by-nya cuma kebetulan sama dengan pembuat/dirinya
  // sendiri karena data sebelum perbaikan ini selalu mengisi assigned_by = pembuat task).
  if (canAssignToOthers(session) && task.assigned_by === session.userId && task.assigned_by !== task.assigned_to) {
    return true;
  }
  return false;
}

/**
 * Aturan kelola/edit (permintaan user, DIPERSEMPIT dari sebelumnya yang menyamakan dengan
 * canViewTask): HANYA Admin, atau task yang assignee-nya (assigned_to) dirinya sendiri. Pemimpin
 * & Manager tetap bisa MELIHAT task user lain (lewat canViewTask di atas) tapi tidak pernah bisa
 * mengelolanya — murni view-only, tidak boleh mengubah field, Time Tracking, Cancel Task, atau
 * menambah komentar (semua endpoint aksi Task memakai canManageTask sebagai gate, lihat
 * src/app/api/tasks/[id]/route.ts, time-tracking/route.ts, comments/route.ts).
 */
export function canManageTask(session: SessionPayload, task: SheetRow): boolean {
  if (session.roleKey === 'admin') return true;
  return task.assigned_to === session.userId;
}

/**
 * Sama seperti canAssignToOthers() di aplikasi PHP lama, DIPERLUAS (permintaan user, fitur Leader
 * Role): Admin & Pemimpin (session.isLeader) selalu boleh menugaskan ke siapa saja (kecuali Admin
 * & Pemimpin lain — lihat isNonAssignableRole); role lain mengikuti flag can_assign_others yang
 * sudah dihitung ulang independen di server saat login (session.canAssignOthers), bukan dipercaya
 * dari request client.
 */
export function canAssignToOthers(session: SessionPayload): boolean {
  if (session.roleKey === 'admin') return true;
  if (session.isLeader) return true;
  return session.canAssignOthers;
}
