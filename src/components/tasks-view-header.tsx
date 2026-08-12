'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string }[] = [
  { href: '/tasks', label: 'List' },
  { href: '/tasks/kanban', label: 'Kanban' },
  { href: '/tasks/calendar', label: 'Calendar' },
];

/**
 * Segmented control List/Kanban/Calendar (Fase 10 — video-fidelity pass) — di aplikasi lama ini
 * adalah tab DI DALAM halaman Tasks (kanan atas), bukan submenu sidebar. Dipakai bersama oleh
 * ketiga halaman /tasks, /tasks/kanban, /tasks/calendar supaya konsisten & tidak remount penuh
 * (masih 3 route Next.js terpisah — lihat catatan di app/(app)/layout.tsx).
 */
export function TasksViewSwitcher() {
  const pathname = usePathname();
  return (
    <div className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 bg-gray-50 p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Header halaman Tasks yang seragam di ketiga tampilan: judul "Tasks" + subtitle dinamis (jumlah
 * task / instruksi drag / jumlah task bulan ini — beda-beda per tampilan seperti video), tombol
 * "+ Add Task", dan switcher di atas. onAddTask dipakai halaman List (buka modal langsung di
 * tempat); addTaskHref dipakai Kanban/Calendar (arahkan ke List dengan modal auto-terbuka, supaya
 * form Tambah Task cuma py satu implementasi, tidak diduplikasi di 3 komponen).
 */
export function TasksPageHeader({
  subtitle,
  onAddTask,
  addTaskHref,
  canCreate = true,
}: {
  subtitle: string;
  onAddTask?: () => void;
  addTaskHref?: string;
  canCreate?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
        <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <TasksViewSwitcher />
        {canCreate &&
          (onAddTask ? (
            <button
              type="button"
              onClick={onAddTask}
              className="shrink-0 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              + Add Task
            </button>
          ) : addTaskHref ? (
            <Link
              href={addTaskHref}
              className="shrink-0 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              + Add Task
            </Link>
          ) : null)}
      </div>
    </div>
  );
}
