import type { SheetRow } from '@/lib/google/sheet-table';
import type { SessionPayload } from '@/lib/auth/session';
import { isAdminRole, isLeaderRole, type Role } from '@/lib/models/roles';

/**
 * Aturan visibilitas Task (DIPERBARUI — permintaan user, perbaikan Leader & Pemberi Tugas):
 * - Admin (session.isAdmin — role_key bawaan sistem 'admin' ATAU role lain yang ditandai
 *   is_admin="Ya" di Master Role) melihat & mengelola semua task (tidak berubah).
 * - Role "Pemimpin" (session.isLeader, ditandai lewat Master Role) melihat DAN MENGELOLA PENUH
 *   seluruh task milik user lain (lihat canManageTaskInfo di bawah — poin 1, pembalikan
 *   kebijakan eksplisit dari sebelumnya yang membuat Pemimpin view-only untuk task orang lain).
 * - User dengan canAssignToOthers() (setara "Manager", dari flag Employment Type) HANYA melihat:
 *   (a) task yang assignee-nya dirinya sendiri (task miliknya, bebas dikelola), DAN
 *   (b) task yang dia sendiri tugaskan ke user lain (assigned_by === dirinya) — kelola penuh
 *   informasinya selagi masih status awal (poin 2, lihat canManageTaskInfo/canEditTaskFieldsNow),
 *   tapi TIDAK bisa mengedit info task itu di luar jendela status awal.
 * - Role/user lain (setara "Member") HANYA melihat task yang assignee-nya (assigned_to) dirinya
 *   sendiri — termasuk task hasil delegasi dari orang lain, yang cuma boleh dikerjakan
 *   (status/Time Tracking) tanpa bisa mengedit informasinya (poin 3, lihat canOperateTimeTracking).
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

/** Task "milik sendiri" — assignee-nya dirinya sendiri DAN bukan hasil delegasi dari orang lain
 *  (assigned_by kosong, atau assigned_by === assigned_to karena self-assign). */
function isSelfOwnedTask(session: SessionPayload, task: SheetRow): boolean {
  return task.assigned_to === session.userId && (!task.assigned_by || task.assigned_by === task.assigned_to);
}

/** Sesi ini adalah "Pemberi Tugas" (delegator) dari task ini — menugaskan ke user LAIN (bukan
 *  dirinya sendiri). */
function isTaskDelegator(session: SessionPayload, task: SheetRow): boolean {
  return task.assigned_by === session.userId && task.assigned_by !== task.assigned_to;
}

/**
 * Aturan kelola INFORMASI task (judul/deskripsi/client/project/priority/tipe/assignee/tanggal/dst)
 * — DIPERBARUI (permintaan user, perbaikan Leader & Pemberi Tugas, poin 1 & 2):
 * - Admin: selalu bisa (tidak berubah).
 * - Pemimpin (session.isLeader): SEKARANG bisa mengelola SELURUH task siapa pun, tidak lagi
 *   view-only seperti sebelumnya — pembalikan kebijakan eksplisit dari permintaan user.
 * - Task milik sendiri (assignee = dirinya, bukan delegasi dari orang lain): tetap bisa, seperti
 *   sebelumnya.
 * - "Pemberi Tugas" (assigned_by = dirinya, ditugaskan ke user LAIN): SEKARANG bisa mengelola
 *   juga (sebelumnya cuma bisa kalau punya izin lain) — tapi kemampuan mengubah FIELD & MENGHAPUS
 *   dibatasi lebih lanjut hanya selagi task masih di status awal, lihat canEditTaskFieldsNow &
 *   canDeleteTask di bawah.
 * - Penerima tugas (assigned_to = dirinya, tapi hasil delegasi dari orang lain, assigned_by !==
 *   dirinya): TIDAK BISA mengelola informasi task ini sama sekali (poin 3) — tetap bisa
 *   mengoperasikan status/Time Tracking, lihat canOperateTimeTracking.
 */
export function canManageTaskInfo(session: SessionPayload, task: SheetRow): boolean {
  if (session.isAdmin) return true;
  if (session.isLeader) return true;
  if (isSelfOwnedTask(session, task)) return true;
  if (isTaskDelegator(session, task)) return true;
  return false;
}

/**
 * Aturan BOLEH MENGUBAH FIELD SEKARANG (dipakai untuk validasi server di PATCH & untuk
 * disabled/enabled form field + tombol "Simpan Perubahan" di client) — permintaan user eksplisit
 * (perbaikan susulan): begitu task melewati status awal, informasinya TERKUNCI untuk SIAPA PUN
 * tanpa kecuali — termasuk Admin, Pemimpin, dan pemilik task sendiri, bukan cuma Pemberi Tugas.
 * Perubahan informasi lewat form ini HANYA boleh terjadi selagi task masih di status awal
 * (is_default) — di luar itu, satu-satunya cara resmi mengubah task adalah lewat tombol aksi Time
 * Tracking (Start/Pause/Stop/Back/Done), Cancel Task, atau drag & drop Kanban, supaya business
 * rule & History Log tetap konsisten.
 */
export function canEditTaskFieldsNow(session: SessionPayload, task: SheetRow, isDefaultStatus: boolean): boolean {
  return canManageTaskInfo(session, task) && isDefaultStatus;
}

/**
 * Aturan HAPUS task — sama pola dengan canEditTaskFieldsNow, TAPI sengaja TIDAK menambah
 * pembatasan status baru untuk Admin/Pemimpin/pemilik task sendiri (permintaan user cuma
 * menyebut "Pemberi tugas... selagi tasking masih pada status awal", jadi kemampuan hapus
 * Admin/Pemimpin/pemilik yang sudah berjalan tanpa batas status TIDAK diubah di sini).
 */
export function canDeleteTask(session: SessionPayload, task: SheetRow, isDefaultStatus: boolean): boolean {
  if (session.isAdmin) return true;
  if (session.isLeader) return true;
  if (isSelfOwnedTask(session, task)) return true;
  if (isTaskDelegator(session, task)) return isDefaultStatus;
  return false;
}

/**
 * Aturan mengoperasikan STATUS/Time Tracking (Start/Pause/Resume/Stop/Back/Done, termasuk drag
 * Kanban untuk transisi standar) — permintaan user poin 3 ("Tetap boleh ubah status + Time
 * Tracking"): penerima delegasi TETAP boleh mengerjakan tugasnya (ubah status, pakai Time
 * Tracking) walau tidak boleh mengedit informasi task. Cancel Task TIDAK termasuk di sini —
 * Cancel tetap digerbangi canManageTaskInfo (penerima tugas tidak boleh membatalkan sepihak task
 * yang ditugaskan orang lain ke dia, cuma boleh mengerjakan/menghentikan sementara).
 */
export function canOperateTimeTracking(session: SessionPayload, task: SheetRow): boolean {
  if (canManageTaskInfo(session, task)) return true;
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
