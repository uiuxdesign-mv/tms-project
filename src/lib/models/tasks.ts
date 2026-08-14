import type { SheetRow } from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';
import { isAdminRole, isLeaderRole, type Role } from '@/lib/models/roles';

/**
 * Aturan visibilitas Task (Fase 7, DIPERBARUI — permintaan user, fitur Leader Role & pembatasan
 * visibilitas "Manager"):
 * - Admin (session.isAdmin — role_key bawaan sistem 'admin' ATAU role lain yang ditandai
 *   is_admin="Ya" di Master Role) melihat & mengelola semua task (tidak berubah).
 * - Role "Pemimpin" (session.isLeader, ditandai lewat Master Role) melihat SELURUH task milik
 *   user lain, TAPI murni view-only untuk task yang bukan miliknya — tidak pernah bisa mengelola
 *   task user lain (lihat canManageTask di bawah). Task yang assignee-nya dirinya sendiri (kalau
 *   ada, mis. ditugaskan oleh Admin atau Pemimpin menugaskan dirinya sendiri — lihat
 *   canAssignTaskTo) tetap bisa dikelola penuh seperti biasa.
 * - User dengan canAssignToOthers() (setara "Manager", dari flag Employment Type) HANYA melihat:
 *   (a) task yang assignee-nya dirinya sendiri (task miliknya, bebas dikelola), DAN
 *   (b) task yang dia sendiri tugaskan ke user lain (assigned_by === dirinya) — tapi ini
 *   VIEW-ONLY, tidak bisa diapa-apakan (lihat canManageTask). Sebelumnya Manager melihat &
 *   mengelola SEMUA task siapa pun — dipersempit sesuai permintaan user eksplisit.
 * - Role/user lain (setara "Member") HANYA melihat task yang assignee-nya (assigned_to) dirinya
 *   sendiri.
 */
export function canViewTask(session: SessionPayload, task: SheetRow): boolean {
  if (session.isAdmin) return true;
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
  if (session.isAdmin) return true;
  return task.assigned_to === session.userId;
}

/**
 * Sama seperti canAssignToOthers() di aplikasi PHP lama, DIPERLUAS (permintaan user, fitur Leader
 * Role): Admin & Pemimpin (session.isLeader) selalu boleh menugaskan ke siapa saja (dibatasi lebih
 * detail per-target lewat canAssignTaskTo di bawah — Admin & Pemimpin lain TIDAK BOLEH ditugaskan
 * oleh sembarang orang); role lain mengikuti flag can_assign_others yang sudah dihitung ulang
 * independen di server saat login (session.canAssignOthers), bukan dipercaya dari request client.
 */
export function canAssignToOthers(session: SessionPayload): boolean {
  if (session.isAdmin) return true;
  if (session.isLeader) return true;
  return session.canAssignOthers;
}

/**
 * Aturan SIAPA BOLEH MENUNJUK SIAPA (permintaan user, perbaikan Admin/Leader — poin 1-3):
 * - Target ber-role Admin: HANYA boleh ditugaskan oleh DIRINYA SENDIRI (self-assign). Tidak
 *   boleh oleh siapa pun lain, termasuk Admin lain — "Admin tidak dapat diberikan tugas oleh
 *   user lain" tetap berlaku penuh, cuma sekarang Admin boleh menugaskan dirinya sendiri
 *   (sebelumnya malah tidak bisa sama sekali, termasuk ke diri sendiri — bug, sudah diperbaiki).
 * - Target ber-role Pemimpin (dan BUKAN Admin — lihat isLeaderRole): boleh ditugaskan oleh
 *   dirinya sendiri, ATAU oleh siapa pun yang ber-role Admin (session.isAdmin). Selain itu
 *   (Pemimpin lain, Manager, Member) tidak boleh menugaskan ke Pemimpin.
 * - Target biasa (bukan Admin/Pemimpin): boleh ditugaskan oleh dirinya sendiri, atau siapa pun
 *   dengan canAssignToOthers() (Admin/Pemimpin/Manager).
 *
 * Dipakai untuk menyaring opsi dropdown Assignee (GET /api/tasks/options) DAN validasi assignee
 * di server (POST/PATCH /api/tasks) — satu fungsi yang sama supaya opsi yang ditampilkan di UI
 * selalu konsisten dengan yang benar-benar diterima server.
 */
export function canAssignTaskTo(
  session: SessionPayload,
  targetUserId: string,
  targetRole: Pick<Role, 'role_key' | 'is_admin' | 'is_leader'> | undefined
): boolean {
  const isSelf = session.userId === targetUserId;
  if (isAdminRole(targetRole)) return isSelf;
  if (isLeaderRole(targetRole)) return isSelf || session.isAdmin;
  return isSelf || canAssignToOthers(session);
}
