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
  dashboard_welcome_back: { id: 'Selamat Datang', en: 'Welcome back' },
  dashboard_welcome_subtitle: {
    id: 'Berikut yang terjadi di seluruh ruang kerja Anda.',
    en: "Here's what's happening across your workspace.",
  },
  dashboard_total_tasks: { id: 'Total Tugas', en: 'Total Tasks' },
  dashboard_todo: { id: 'Belum Dikerjakan', en: 'To Do' },
  dashboard_in_progress: { id: 'Dalam Proses', en: 'In Progress' },
  dashboard_in_review: { id: 'Dalam Peninjauan', en: 'In Review' },
  dashboard_overdue: { id: 'Terlambat', en: 'Overdue' },
  dashboard_due_soon: { id: 'Jatuh Tempo 7 Hari', en: 'Due in 7 Days' },
  dashboard_completed: { id: 'Selesai', en: 'Complete' },
  dashboard_hours_worked_today: { id: 'Jam Kerja Hari Ini', en: 'Hours Worked Today' },
  dashboard_weekly_productivity: { id: 'Produktivitas Mingguan', en: 'Weekly Productivity' },
  dashboard_view_full_report: { id: 'Lihat laporan lengkap →', en: 'View full report →' },
  dashboard_quick_filter_today: { id: 'Hari Ini', en: 'Today' },
  dashboard_quick_filter_week: { id: 'Minggu Ini', en: 'This Week' },
  dashboard_quick_filter_month: { id: 'Bulan Ini', en: 'This Month' },
  dashboard_quick_filter_year: { id: 'Tahun Ini', en: 'This Year' },
  dashboard_quick_filter_note: {
    id: 'Hanya memfilter bagan — kartu ringkasan selalu menampilkan total saat ini.',
    en: 'Only filters the charts — summary cards always show current totals.',
  },
  dashboard_task_status: { id: 'Status Tugas', en: 'Task Status' },
  dashboard_tasks_per_project: { id: 'Tugas per Proyek', en: 'Tasks per Project' },
  dashboard_tasks_per_client: { id: 'Tugas per Klien', en: 'Tasks per Client' },
  dashboard_productivity_trend: { id: 'Tren Produktivitas', en: 'Productivity Trend' },
  dashboard_priority_distribution: { id: 'Distribusi Prioritas', en: 'Priority Distribution' },
  dashboard_assignee_workload: { id: 'Beban Kerja Assignee', en: 'Assignee Workload' },
  dashboard_by_status: { id: 'Berdasarkan Status', en: 'By Status' },
  dashboard_by_priority: { id: 'Berdasarkan Prioritas', en: 'By Priority' },
  dashboard_by_task_type: { id: 'Berdasarkan Tipe Tugas', en: 'By Task Type' },
  dashboard_top_assignee: { id: 'Top Assignee', en: 'Top Assignees' },
  dashboard_completion_status: { id: 'Status Penyelesaian', en: 'Completion Status' },
  dashboard_active: { id: 'Aktif', en: 'Active' },
  dashboard_weekly_trend: { id: 'Tren Jatuh Tempo Mingguan', en: 'Weekly Due Date Trend' },
  dashboard_no_data_yet: { id: 'Belum ada data', en: 'No data yet' },
  dashboard_no_data_yet_caption: {
    id: 'Terisi otomatis setelah tugas dibuat di Tasking.',
    en: 'Filled in automatically once tasks are created in Tasking.',
  },
  dashboard_recent_activity: { id: 'Aktivitas Terbaru', en: 'Recent Activity' },
  dashboard_no_activity: { id: 'Belum ada aktivitas.', en: 'No activity yet.' },
  dashboard_recent_comments: { id: 'Komentar Terbaru', en: 'Recent Comments' },
  dashboard_no_comments: { id: 'Belum ada komentar.', en: 'No comments yet.' },
  dashboard_upcoming_due: { id: 'Tenggat Waktu Mendatang', en: 'Upcoming Deadlines' },
  dashboard_no_upcoming_due: { id: 'Tidak ada tenggat waktu mendatang.', en: 'No upcoming deadlines.' },
  dashboard_recent_tasks: { id: 'Tugas Terbaru', en: 'Recent Tasks' },
  dashboard_no_recent_tasks: { id: 'Belum ada tugas.', en: 'No tasks yet.' },
  dashboard_recent_time_tracking: { id: 'Pelacakan Waktu Terbaru', en: 'Recent Time Tracking' },
  dashboard_no_time_tracking: { id: 'Belum ada waktu yang dilacak.', en: 'No time tracked yet.' },
  dashboard_spent: { id: 'menghabiskan', en: 'spent' },
  dashboard_on_task: { id: 'pada', en: 'on' },
  dashboard_view_all: { id: 'Lihat semua →', en: 'View all →' },
  dashboard_footer_note: {
    id: 'Menu Master Data & Administrasi mengikuti hak akses role Anda — lihat sidebar di kiri. Ringkasan & Report tugas mengikuti visibilitas Tasks yang sama seperti sebelumnya.',
    en: 'Master Data & Administration menus follow your role permissions — see the sidebar on the left. Task summary & Report follow the same Task visibility rules as before.',
  },

  // Login
  login_title: { id: 'Masuk ke TMS', en: 'Sign in to TMS' },
  login_email: { id: 'Alamat Email', en: 'Email Address' },
  login_password: { id: 'Kata Sandi', en: 'Password' },
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
