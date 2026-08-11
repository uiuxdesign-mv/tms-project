import type { SheetRow } from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';

/**
 * Aturan visibilitas Task (Fase 7 — dipersempit supaya sesuai aplikasi lama, atas konfirmasi
 * eksplisit pemilik produk):
 * - Admin melihat semua task (sama seperti aplikasi lama).
 * - Role/user yang canAssignToOthers() (setara "Manager" di aplikasi lama — di NEW ini dihitung
 *   dari flag Employment Type, never-trust-client, sama seperti gate assign-ke-orang-lain)
 *   JUGA melihat semua task — meniru memberOwnsTask() di aplikasi lama: "Role dengan
 *   canAssignToOthers() (Admin/Manager/employment type tertentu) melihat semua."
 * - Role/user lain (setara "Member") HANYA melihat task yang assignee-nya (assigned_to) dirinya
 *   sendiri — BUKAN lagi "yang dia buat ATAU yang ditugaskan ke dia" seperti sebelumnya (itu
 *   lebih longgar dari aplikasi lama, yang murni cek assignee_id saja untuk Member).
 *
 * Sebelumnya (sampai Fase 6) Tasks tidak diatur lewat Menu Access sama sekali; Fase 7 menambahkan
 * gating tasking/report via requirePermission() di layer API — lihat src/app/api/tasks/*.
 */
export function canViewTask(session: SessionPayload, task: SheetRow): boolean {
  if (session.roleKey === 'admin') return true;
  if (canAssignToOthers(session)) return true;
  return task.assigned_to === session.userId;
}

/**
 * Aturan edit: sama seperti visibilitas (Admin & canAssignToOthers bebas, selain itu hanya
 * task yang assignee-nya dirinya sendiri).
 */
export function canManageTask(session: SessionPayload, task: SheetRow): boolean {
  return canViewTask(session, task);
}

/**
 * Sama seperti canAssignToOthers() di aplikasi PHP lama: Admin selalu boleh menugaskan ke
 * siapa saja; role lain mengikuti flag can_assign_others yang sudah dihitung ulang independen
 * di server saat login (session.canAssignOthers), bukan dipercaya dari request client.
 */
export function canAssignToOthers(session: SessionPayload): boolean {
  if (session.roleKey === 'admin') return true;
  return session.canAssignOthers;
}
