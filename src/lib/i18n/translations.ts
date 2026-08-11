/**
 * Kamus terjemahan ID/EN (Fase 10). Cakupan saat ini: chrome navigasi (sidebar + topbar),
 * halaman Dashboard, dan halaman Login — permukaan yang paling sering dilihat setiap user setiap
 * kali memakai aplikasi. Menerjemahkan SELURUH string di semua form/tabel Master Data, Tasks, dan
 * Report (ratusan label, pesan validasi, dsb.) adalah pekerjaan besar tersendiri di luar cakupan
 * ini — infrastrukturnya (LanguageProvider, hook useTranslation, toggle ID/EN) sudah generik dan
 * siap dipakai untuk memperluas cakupan itu kapan saja, tinggal menambah entry baru di sini dan
 * memanggil t('key') di komponen yang bersangkutan.
 */
export type Lang = 'id' | 'en';

export const translations = {
  // Nav — sidebar & topbar
  nav_dashboard: { id: 'Dashboard', en: 'Dashboard' },
  nav_tasking: { id: 'Tasking', en: 'Tasking' },
  nav_tasks_list: { id: 'Daftar Tugas', en: 'Task List' },
  nav_tasks_kanban: { id: 'Kanban', en: 'Kanban' },
  nav_tasks_calendar: { id: 'Calendar', en: 'Calendar' },
  nav_report: { id: 'Report', en: 'Report' },
  nav_master_data: { id: 'Master Data', en: 'Master Data' },
  nav_admin: { id: 'Administrasi', en: 'Administration' },
  nav_master_users: { id: 'Master User', en: 'Users' },
  nav_menu_access: { id: 'Menu Access', en: 'Menu Access' },
  nav_audit_log: { id: 'Audit Log', en: 'Audit Log' },
  nav_profile: { id: 'Profil Saya', en: 'My Profile' },
  nav_logout: { id: 'Keluar', en: 'Log Out' },
  nav_open_menu: { id: 'Buka menu', en: 'Open menu' },

  // Toggle tema & bahasa — topbar
  theme_to_dark: { id: 'Mode gelap', en: 'Dark mode' },
  theme_to_light: { id: 'Mode terang', en: 'Light mode' },
  lang_switch: { id: 'Ganti ke Bahasa Inggris', en: 'Switch to Indonesian' },

  // Dashboard
  dashboard_title: { id: 'Dashboard', en: 'Dashboard' },
  dashboard_login_as: { id: 'Login berhasil sebagai', en: 'Logged in as' },
  dashboard_role: { id: 'Role', en: 'Role' },
  dashboard_can_assign: { id: 'Boleh menugaskan ke user lain', en: 'Can assign to other users' },
  dashboard_yes: { id: 'Ya', en: 'Yes' },
  dashboard_no: { id: 'Tidak', en: 'No' },
  dashboard_total_tasks: { id: 'Total Tugas', en: 'Total Tasks' },
  dashboard_overdue: { id: 'Terlambat', en: 'Overdue' },
  dashboard_due_soon: { id: 'Jatuh Tempo 7 Hari', en: 'Due in 7 Days' },
  dashboard_completed: { id: 'Selesai', en: 'Completed' },
  dashboard_view_full_report: { id: 'Lihat laporan lengkap →', en: 'View full report →' },
  dashboard_by_status: { id: 'Berdasarkan Status', en: 'By Status' },
  dashboard_by_priority: { id: 'Berdasarkan Prioritas', en: 'By Priority' },
  dashboard_by_task_type: { id: 'Berdasarkan Tipe Tugas', en: 'By Task Type' },
  dashboard_top_assignee: { id: 'Top Assignee', en: 'Top Assignees' },
  dashboard_completion_status: { id: 'Status Penyelesaian', en: 'Completion Status' },
  dashboard_active: { id: 'Aktif', en: 'Active' },
  dashboard_weekly_trend: { id: 'Tren Jatuh Tempo Mingguan', en: 'Weekly Due Date Trend' },
  dashboard_recent_activity: { id: 'Aktivitas Terbaru', en: 'Recent Activity' },
  dashboard_recent_comments: { id: 'Komentar Terbaru', en: 'Recent Comments' },
  dashboard_upcoming_due: { id: 'Tugas Jatuh Tempo Segera (14 Hari)', en: 'Upcoming Due Tasks (14 Days)' },
  dashboard_recent_tasks: { id: 'Tugas Terbaru', en: 'Recent Tasks' },
  dashboard_view_all: { id: 'Lihat semua →', en: 'View all →' },
  dashboard_footer_note: {
    id: 'Menu Master Data & Administrasi mengikuti hak akses role Anda — lihat sidebar di kiri. Ringkasan & Report tugas mengikuti visibilitas Tasks yang sama seperti sebelumnya.',
    en: 'Master Data & Administration menus follow your role permissions — see the sidebar on the left. Task summary & Report follow the same Task visibility rules as before.',
  },

  // Login
  login_title: { id: 'Masuk ke TMS', en: 'Sign in to TMS' },
  login_email: { id: 'Email', en: 'Email' },
  login_password: { id: 'Password', en: 'Password' },
  login_submit: { id: 'Masuk', en: 'Sign In' },
  login_submitting: { id: 'Memproses...', en: 'Signing in...' },

  // Aksi umum (dipakai lintas komponen)
  action_save: { id: 'Simpan', en: 'Save' },
  action_cancel: { id: 'Batal', en: 'Cancel' },
  action_delete: { id: 'Hapus', en: 'Delete' },
  action_edit: { id: 'Edit', en: 'Edit' },
  action_add: { id: 'Tambah', en: 'Add' },
} as const;

export type TranslationKey = keyof typeof translations;
