/**
 * Mapping nama tabel logis -> Spreadsheet ID Google Sheets yang sebenarnya.
 * Tiap tabel = 1 file spreadsheet terpisah (bukan tab dalam satu file).
 *
 * Nilai diambil dari environment variable supaya ID tidak ikut ter-commit ke git
 * dan mudah diganti per environment (development / production di Vercel).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} belum diset.`);
  }
  return value;
}

export const SPREADSHEET_IDS = {
  users: () => requireEnv('SHEET_ID_USERS'),
  roles: () => requireEnv('SHEET_ID_ROLES'),
  clients: () => requireEnv('SHEET_ID_CLIENTS'),
  projects: () => requireEnv('SHEET_ID_PROJECTS'),
  priorities: () => requireEnv('SHEET_ID_PRIORITIES'),
  task_types: () => requireEnv('SHEET_ID_TASK_TYPES'),
  employment_types: () => requireEnv('SHEET_ID_EMPLOYMENT_TYPES'),
  statuses: () => requireEnv('SHEET_ID_STATUSES'),
  menu_access: () => requireEnv('SHEET_ID_MENU_ACCESS'),
  tasks: () => requireEnv('SHEET_ID_TASKS'),
  audit_log: () => requireEnv('SHEET_ID_AUDIT_LOG'),
  task_time_logs: () => requireEnv('SHEET_ID_TASK_TIME_LOGS'),
  task_comments: () => requireEnv('SHEET_ID_TASK_COMMENTS'),
  // Log history perubahan task (field & status) — permintaan user poin 4. Spreadsheet terpisah
  // (baru) yang disiapkan & di-share manual oleh user, lihat SKILL/pesan setup di percakapan.
  task_history: () => requireEnv('SHEET_ID_TASK_HISTORY'),
  // Notifikasi in-app (permintaan user Round 5, poin 3 & 4: penunjukan tugas langsung muncul di
  // bell notifikasi header). Spreadsheet terpisah (baru), disiapkan & di-share manual oleh user
  // sama seperti task_history — lihat lib/models/notifications.ts untuk skema kolomnya.
  notifications: () => requireEnv('SHEET_ID_NOTIFICATIONS'),
} as const;

export type SheetKey = keyof typeof SPREADSHEET_IDS;
