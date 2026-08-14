import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/require-permission';
import * as SheetTable from '@/lib/google/sheet-table';
import { canViewTask, canAssignToOthers } from '@/lib/models/tasks';
import { getAllRoles, isNonAssignableRole } from '@/lib/models/roles';

export async function GET() {
  const guard = await requirePermission('tasking', 'view');
  if ('error' in guard) return guard.error;
  const { session } = guard;

  // Bugfix (permintaan user, item data-staleness): opsi dropdown form Add/Edit Task ini sering
  // dibuka tepat setelah admin ubah Master Data terkait (Client/Project/Task Type/dst) — samakan
  // dengan fix cache di GET /api/master/[entity], selalu baca langsung dari Google Sheets.
  //
  // Bugfix susulan (permintaan user, "Unexpected end of JSON input" saat buka Task/Kanban):
  // endpoint ini sebelumnya TIDAK dibungkus try/catch, padahal dipanggil di HAMPIR SETIAP
  // pembukaan halaman/modal Task — begitu Google Sheets API gagal sesaat (rate limit 429,
  // network hiccup), exception yang tidak tertangani membuat Next.js/Vercel mengembalikan
  // respons tanpa body JSON yang valid. Di client, `res.json()` gagal dengan pesan mentah
  // browser ("Unexpected end of JSON input") yang membingungkan alih-alih pesan error yang
  // jelas. Sekarang ditangkap & dikembalikan sebagai JSON 503, sama seperti pola di GET /api/tasks.
  try {
    const [clients, projects, taskTypes, priorities, statuses, users, tasks, roles] = await Promise.all([
      SheetTable.getAll('clients', { useCache: false }),
      SheetTable.getAll('projects', { useCache: false }),
      SheetTable.getAll('task_types', { useCache: false }),
      SheetTable.getAll('priorities', { useCache: false }),
      SheetTable.getAll('statuses', { useCache: false }),
      SheetTable.getAll('users', { useCache: false }),
      SheetTable.getAll('tasks', { useCache: false }),
      getAllRoles({ useCache: false }),
    ]);

    // Bugfix (permintaan user): Admin & role Pemimpin TIDAK BOLEH ditugaskan task oleh siapa pun
    // — disaring dari daftar opsi Assignee di sini, di depan (sebelumnya cuma pakai `status ===
    // 'Active'`, jadi Admin/Pemimpin masih bisa dipilih). Validasi ulang tetap ada di server saat
    // create/update task (POST/PATCH /api/tasks) supaya tidak bisa dilewati lewat request langsung.
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const assignableUsers = users.filter((u) => u.status === 'Active' && !isNonAssignableRole(roleById.get(u.role_id)));
    const allowAssignOthers = canAssignToOthers(session);
    const assigneeOptions = allowAssignOthers
      ? assignableUsers.map((u) => ({ value: u.id, label: u.name }))
      : assignableUsers.filter((u) => u.id === session.userId).map((u) => ({ value: u.id, label: u.name }));

    const visibleTasks = tasks.filter((t) => canViewTask(session, t));

    return NextResponse.json({
      data: {
        canAssignOthers: allowAssignOthers,
        // Bugfix (permintaan user): Client sekarang bisa menautkan beberapa Project terkait
        // (multi-select `project_ids` di Master Client) — dikirim di sini sebagai `projectIds`
        // supaya form Add Task bisa memfilter pilihan Project berdasarkan Client yang dipilih.
        clients: clients
          .filter((c) => c.status === 'Active')
          .map((c) => ({
            value: c.id,
            label: c.client_name,
            projectIds: (c.project_ids || '').split(',').map((s) => s.trim()).filter(Boolean),
          })),
        // Bugfix (Fase 13): sebelumnya `projects` TIDAK difilter status seperti clients/taskTypes/
        // priorities/statuses di bawah — project yang sudah di-nonaktifkan lewat Master Data masih
        // muncul & bisa dipilih di form Add/Edit Task. Disamakan dengan pola field lain di sini.
        projects: projects
          .filter((p) => p.status === 'Active')
          .map((p) => ({ value: p.id, label: p.project_name, clientId: p.client_id })),
        taskTypes: taskTypes
          .filter((t) => t.status === 'Active')
          .map((t) => ({ value: t.id, label: t.type_name, requiresRelatedTask: t.requires_related_task === 'Ya' })),
        priorities: priorities.filter((p) => p.status === 'Active').map((p) => ({ value: p.id, label: p.priority_name })),
        statuses: statuses
          .filter((s) => s.is_active === 'Ya')
          .map((s) => ({
            value: s.id,
            label: s.status_name,
            isFinal: s.is_final === 'Ya',
            isDefault: s.is_default === 'Ya',
            isReview: s.is_review === 'Ya',
            workflow_level: s.workflow_level,
            colorCode: s.color_code || null,
          })),
        assignees: assigneeOptions,
        relatedTasks: visibleTasks.map((t) => ({ value: t.id, label: t.title })),
      },
    });
  } catch (err) {
    console.error('GET /api/tasks/options gagal:', err);
    return NextResponse.json(
      { error: 'Gagal memuat opsi Task dari Google Sheets. Coba muat ulang halaman.' },
      { status: 503 }
    );
  }
}
