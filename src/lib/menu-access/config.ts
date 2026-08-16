import { MASTER_DATA_ENTITIES } from '@/lib/master-data/config';

export type MenuAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

export type MenuKeyDef = {
  key: string;
  label: string;
  href: string;
};

/**
 * Menu Tasking & Report (Fase 7) — sebelumnya TIDAK ada di matrix sama sekali (endpoint hanya
 * requireAuth(), siapa pun yang login otomatis dapat akses penuh). Sekarang digerbang sama
 * seperti Master Data, meniru menu_key `tasking`/`report` di aplikasi lama.
 */
export const TASK_MENU_KEYS: MenuKeyDef[] = [
  { key: 'tasking', label: 'Tasking', href: '/tasks' },
  { key: 'report', label: 'Report', href: '/reports' },
];

/** Satu entry per master data generik dari config Fase 1. Menambah master data baru otomatis menambah menu baru di sini juga. */
export const MASTER_MENU_KEYS: MenuKeyDef[] = Object.entries(MASTER_DATA_ENTITIES).map(([key, cfg]) => ({
  key: `master-${key}`,
  label: `Master ${cfg.labelPlural}`,
  href: `/master/${key}`,
}));

/**
 * Daftar menu yang hak aksesnya diatur per-role lewat sheet Menu Access.
 *
 * Fase 7: "master-users" SENGAJA TIDAK ADA di sini lagi (sebelumnya delegable ke role
 * non-admin) — dikunci permanen admin-only, meniru aplikasi lama yang mengecualikan Master
 * User dari matrix ini selamanya by design (risiko delegasi manajemen user terlalu sensitif).
 * Lihat requireAdmin() di src/app/api/users/*.
 */
export const MENU_KEYS: MenuKeyDef[] = [...TASK_MENU_KEYS, ...MASTER_MENU_KEYS];
