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
  nav_tasking: { id: 'Tasks', en: 'Tasks' },
  nav_tasks_list: { id: 'Daftar Tugas', en: 'Task List' },
  nav_tasks_kanban: { id: 'Kanban', en: 'Kanban' },
  nav_tasks_calendar: { id: 'Calendar', en: 'Calendar' },
  nav_report: { id: 'Report', en: 'Reports' },
  nav_master_data: { id: 'Master Data', en: 'Master Data' },
  nav_admin: { id: 'Administrasi', en: 'Administration' },
  nav_master_users: { id: 'Master User', en: 'Users' },
  nav_menu_access: { id: 'Menu Access', en: 'Menu Access' },
  nav_audit_log: { id: 'Audit Log', en: 'Audit Log' },
  nav_profile: { id: 'Profil Saya', en: 'My Profile' },
  nav_logout: { id: 'Keluar', en: 'Log Out' },
  nav_open_menu: { id: 'Buka menu', en: 'Open menu' },

  // Bugfix (permintaan user, item i18n): entity Master Data di sidebar sebelumnya dibangun dinamis
  // dari config (MASTER_DATA_ENTITIES) TANPA labelKey sama sekali, jadi selalu tampil dalam Bahasa
  // Inggris/label mentah apa pun bahasa yang dipilih. Ditambahkan di sini + di-wire lewat labelKey
  // di src/app/(app)/layout.tsx (masterDataLinks).
  nav_master_clients: { id: 'Klien', en: 'Clients' },
  nav_master_projects: { id: 'Proyek', en: 'Projects' },
  nav_master_priorities: { id: 'Prioritas', en: 'Priorities' },
  nav_master_task_types: { id: 'Tipe Tugas', en: 'Task Types' },
  nav_master_employment_types: { id: 'Tipe Kepegawaian', en: 'Employment Types' },
  nav_master_statuses: { id: 'Status', en: 'Statuses' },
  nav_master_roles: { id: 'Role', en: 'Roles' },

  // Toggle tema & bahasa — topbar
  theme_to_dark: { id: 'Mode gelap', en: 'Dark mode' },
  theme_to_light: { id: 'Mode terang', en: 'Light mode' },
  lang_switch: { id: 'Ganti ke Bahasa Inggris', en: 'Switch to Indonesian' },
  // Perbaikan (permintaan user Round 5, poin 4): opsi bahasa di dropdown topbar disingkat
  // ("Bahasa Indonesia"/"English" penuh -> "ID"/"EN" saja).
  lang_abbr_id: { id: 'ID', en: 'ID' },
  lang_abbr_en: { id: 'EN', en: 'EN' },

  // Notifikasi (permintaan user Round 5, poin 3 & 4) — bell di header, kiri avatar.
  notif_bell_label: { id: 'Notifikasi', en: 'Notifications' },
  notif_dropdown_title: { id: 'Notifikasi', en: 'Notifications' },
  notif_mark_all_read: { id: 'Tandai semua dibaca', en: 'Mark all as read' },
  notif_empty: { id: 'Belum ada notifikasi.', en: 'No notifications yet.' },
  notif_loading: { id: 'Memuat notifikasi...', en: 'Loading notifications...' },
  // {actor} & {title} diganti lewat .replace() di client (pola sama seperti key template lain,
  // mis. u_subtitle) — actor_name & task_title disimpan sebagai snapshot teks di sheet
  // notifications, bukan key i18n, jadi tidak diterjemahkan ulang (memang seharusnya begitu, nama
  // orang & judul task bukan sesuatu yang punya versi ID/EN).
  notif_task_assigned: {
    id: '{actor} menugaskan Anda ke task "{title}"',
    en: '{actor} assigned you to task "{title}"',
  },
  // Permintaan user Round 5 susulan: notifikasi komentar baru di task yang bersangkutan.
  notif_task_comment: {
    id: '{actor} berkomentar di task "{title}"',
    en: '{actor} commented on task "{title}"',
  },
  notif_view_task: { id: 'Lihat task', en: 'View task' },

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
  action_search: { id: 'Cari...', en: 'Search...' },
  action_filter: { id: 'Filter', en: 'Filter' },
  action_reset: { id: 'Reset', en: 'Reset' },
  action_apply: { id: 'Terapkan', en: 'Apply' },
  action_export: { id: 'Ekspor', en: 'Export' },
  action_import: { id: 'Impor', en: 'Import' },
  common_loading: { id: 'Memuat...', en: 'Loading...' },
  common_no_data: { id: 'Tidak ada data.', en: 'No data.' },
  common_saving: { id: 'Menyimpan...', en: 'Saving...' },
  form_save_changes: { id: 'Simpan Perubahan', en: 'Save Changes' },
  form_create: { id: 'Buat', en: 'Create' },

  // Bar pagination generik (PaginationBar) — dipakai di bawah SEMUA tabel data (Tasks, Users,
  // Master Data, Audit Log, Report). Sebelumnya string ini di-hardcode Bahasa Indonesia langsung
  // di komponennya (tidak ikut berganti ID/EN) — bugfix (permintaan user, konfigurasi bahasa).
  pagination_showing: { id: 'Menampilkan {from}–{to} dari {total} data', en: 'Showing {from}–{to} of {total} entries' },
  pagination_prev: { id: 'Sebelumnya', en: 'Previous' },
  pagination_next: { id: 'Selanjutnya', en: 'Next' },

  // Modal konfirmasi global (ConfirmProvider) — dipakai di HAMPIR SEMUA tombol Hapus di seluruh
  // aplikasi (Fase 22, permintaan user item i18n), jadi dampaknya luas walau cuma 3 string.
  confirm_default_title: { id: 'Konfirmasi', en: 'Confirm' },
  confirm_default_yes: { id: 'Ya', en: 'Yes' },

  // Halaman Tasks (List/Kanban/Calendar) — chrome bersama (Fase 22, permintaan user item i18n).
  tasks_add_button: { id: '+ Tambah Task', en: '+ Add Task' },
  tasks_kanban_subtitle: {
    id: 'Seret kartu ke kolom lain untuk mengubah statusnya. Klik kartu untuk melihat/mengedit.',
    en: 'Drag a card to another column to change its status. Click a card to view/edit.',
  },

  // Halaman Master Data (tabel generik) — chrome bersama semua entity.
  master_data_add_button: { id: '+ Tambah', en: '+ Add' },
  master_data_edit_title: { id: 'Ubah', en: 'Edit' },
  master_data_add_title: { id: 'Tambah', en: 'Add' },

  // Halaman Master Users.
  users_page_title: { id: 'Master User', en: 'Users' },
  users_add_button: { id: '+ Tambah User', en: '+ Add User' },

  // Halaman Menu Access.
  menu_access_page_title: { id: 'Menu & Kontrol Akses', en: 'Menu & Access Control' },
  menu_access_subtitle: {
    id: 'Atur menu apa saja yang boleh dilihat/ditambah/diubah/dihapus oleh tiap role. Role Admin selalu punya akses penuh dan tidak diatur di sini.',
    en: 'Configure which menus each role may view/create/edit/delete. The Admin role always has full access and is not configured here.',
  },
  menu_access_role_label: { id: 'Role', en: 'Role' },
  menu_access_loading_roles: { id: 'Memuat daftar role...', en: 'Loading roles...' },
  menu_access_no_roles: { id: 'Belum ada role selain Admin.', en: 'No roles besides Admin yet.' },
  menu_access_col_menu: { id: 'Menu', en: 'Menu' },
  menu_access_action_view: { id: 'Lihat', en: 'View' },
  menu_access_action_create: { id: 'Tambah', en: 'Create' },
  menu_access_action_edit: { id: 'Ubah', en: 'Edit' },
  menu_access_action_delete: { id: 'Hapus', en: 'Delete' },
  menu_access_action_export: { id: 'Ekspor', en: 'Export' },
  menu_access_save_button: { id: 'Simpan Hak Akses', en: 'Save Permissions' },
  menu_access_saving: { id: 'Menyimpan...', en: 'Saving...' },

  // Halaman Reports.
  report_page_title: { id: 'Report', en: 'Reports' },

  // Halaman Profil Saya.
  profile_page_title: { id: 'Profil Saya', en: 'My Profile' },

  // Toast/pesan umum yang dipakai berulang di banyak file — di-dedupe jadi satu key supaya
  // konsisten dan tidak perlu didefinisikan ulang per komponen (permintaan user: sweep i18n
  // menyeluruh termasuk toast).
  toast_network_error: { id: 'Terjadi kesalahan jaringan.', en: 'A network error occurred.' },

  // Task Filter Bar (List/Kanban/Calendar) — dipakai bersama ketiga view Task.
  filter_search_placeholder: { id: 'Cari judul...', en: 'Search title...' },
  filter_title: { id: 'Filter', en: 'Filter' },
  filter_label_status: { id: 'Status', en: 'Status' },
  filter_label_priority: { id: 'Prioritas', en: 'Priority' },
  filter_label_assignee: { id: 'Assignee', en: 'Assignee' },
  filter_option_all_status: { id: 'Semua status', en: 'All statuses' },
  filter_option_all_priority: { id: 'Semua priority', en: 'All priorities' },
  filter_option_all_assignee: { id: 'Semua assignee', en: 'All assignees' },

  // Time Tracking Controls (dipakai di Kanban card & Task Detail Modal).
  tt_work_time: { id: 'Waktu Kerja', en: 'Work Time' },
  tt_review_time: { id: 'Waktu Review', en: 'Review Time' },
  tt_completed_suffix: { id: '(selesai)', en: '(completed)' },
  tt_btn_start: { id: 'Mulai', en: 'Start' },
  tt_btn_pause: { id: 'Jeda', en: 'Pause' },
  tt_btn_stop: { id: 'Stop', en: 'Stop' },
  tt_btn_resume: { id: 'Lanjut', en: 'Resume' },
  tt_btn_back: { id: 'Kembali', en: 'Back' },
  tt_btn_done: { id: 'Selesai', en: 'Done' },
  // Redesign Modal Task Detail Round 10 lanjutan ("Opsi 7" — permintaan user): Time Tracking
  // dipindah jadi bar ringkas di atas Judul/Deskripsi, detail (3 statistik + tab Sesi Kerja/
  // Review + tabel) disembunyikan di belakang tautan toggle ini secara default.
  tt_show_detail: { id: 'Detail Waktu', en: 'Time Details' },
  tt_hide_detail: { id: 'Sembunyikan Detail', en: 'Hide Details' },
  toast_tt_action_failed: { id: 'Gagal menjalankan aksi Time Tracking.', en: 'Failed to run Time Tracking action.' },
  toast_tt_started: { id: 'Task dimulai.', en: 'Task started.' },
  toast_tt_paused: { id: 'Task di-pause.', en: 'Task paused.' },
  toast_tt_resumed: { id: 'Task dilanjutkan.', en: 'Task resumed.' },
  toast_tt_stopped: { id: 'Task dihentikan.', en: 'Task stopped.' },
  toast_tt_back: { id: 'Task dikembalikan ke tahap sebelumnya.', en: 'Task moved back to the previous stage.' },
  toast_tt_done: { id: 'Task ditandai selesai.', en: 'Task marked as done.' },

  // Task Comments.
  toast_comments_load_failed: { id: 'Gagal memuat komentar.', en: 'Failed to load comments.' },
  comment_empty_error: {
    id: 'Komentar harus berisi teks atau lampiran file.',
    en: 'Comment must contain text or a file attachment.',
  },
  toast_comment_send_failed: { id: 'Gagal mengirim komentar.', en: 'Failed to send comment.' },
  toast_comment_sent: { id: 'Komentar berhasil dikirim.', en: 'Comment sent successfully.' },
  toast_comment_save_failed: { id: 'Gagal menyimpan perubahan.', en: 'Failed to save changes.' },
  toast_comment_updated: { id: 'Komentar berhasil diperbarui.', en: 'Comment updated successfully.' },
  confirm_delete_comment_message: { id: 'Hapus komentar ini?', en: 'Delete this comment?' },
  toast_comment_delete_failed: { id: 'Gagal menghapus komentar.', en: 'Failed to delete comment.' },
  toast_comment_deleted: { id: 'Komentar berhasil dihapus.', en: 'Comment deleted successfully.' },
  comments_heading: { id: 'Komentar', en: 'Comments' },
  comments_loading: { id: 'Memuat komentar...', en: 'Loading comments...' },
  comments_empty: { id: 'Belum ada komentar.', en: 'No comments yet.' },
  comments_edited_badge: { id: '(diedit)', en: '(edited)' },
  comment_placeholder: { id: 'Tulis komentar...', en: 'Write a comment...' },
  comment_remove_attachment_aria: { id: 'Hapus lampiran', en: 'Remove attachment' },
  comment_attach_aria: { id: 'Lampirkan file', en: 'Attach file' },
  comment_emoji_aria: { id: 'Sisipkan emoji', en: 'Insert emoji' },
  comment_attachment_will_be_removed: {
    id: 'Lampiran akan dihapus saat disimpan',
    en: 'Attachment will be removed when saved',
  },
  comment_hint: {
    id: 'Maks 1 lampiran per komentar — Gambar 5MB, Video 25MB, File lain 10MB.',
    en: 'Max 1 attachment per comment — Image 5MB, Video 25MB, other files 10MB.',
  },
  comment_sending: { id: 'Mengirim...', en: 'Sending...' },
  comment_send: { id: 'Kirim', en: 'Send' },

  // Riwayat Perubahan Task / History Log (permintaan user poin 4).
  history_heading: { id: 'Riwayat Perubahan', en: 'Change History' },
  history_loading: { id: 'Memuat riwayat...', en: 'Loading history...' },
  history_empty: { id: 'Belum ada riwayat perubahan.', en: 'No change history yet.' },
  history_changed_from: { id: 'diubah dari', en: 'changed from' },
  history_changed_to: { id: 'menjadi', en: 'to' },
  hist_empty_value: { id: '(kosong)', en: '(empty)' },
  toast_history_load_failed: { id: 'Gagal memuat riwayat perubahan.', en: 'Failed to load change history.' },
  // Label field khusus riwayat — sengaja TERPISAH dari td_field_* (yang punya sufiks "*"/
  // "(opsional)" untuk kebutuhan form) supaya kalimat riwayat ("Klien diubah dari ... menjadi
  // ...") tetap bersih tanpa tanda bintang/keterangan form ikut terbawa.
  hist_field_title: { id: 'Judul', en: 'Title' },
  hist_field_description: { id: 'Deskripsi', en: 'Description' },
  hist_field_client: { id: 'Klien', en: 'Client' },
  hist_field_project: { id: 'Proyek', en: 'Project' },
  hist_field_task_type: { id: 'Tipe Tugas', en: 'Task Type' },
  hist_field_priority: { id: 'Prioritas', en: 'Priority' },
  hist_field_assignee: { id: 'Assignee', en: 'Assignee' },
  hist_field_due_date: { id: 'Tanggal Jatuh Tempo', en: 'Due Date' },
  hist_field_start_date: { id: 'Tanggal Mulai', en: 'Start Date' },
  hist_field_est_hours: { id: 'Estimasi Jam', en: 'Est. Hours' },
  hist_field_related_task: { id: 'Task Terkait', en: 'Related Task' },

  // Activity Feed Terpadu (Redesign Modal Task Detail Round 10, "Saran 4" — permintaan user:
  // gabungkan Komentar + Riwayat Perubahan jadi satu feed kronologis dengan filter & collapse
  // aktivitas lama, ala ClickUp). Key comments_*/history_* di atas TETAP dipakai apa adanya di
  // dalam feed ini (item komentar & item riwayat individual) — tidak ada yang dihapus, cuma
  // judul panel gabungan & kontrol baru (filter, loading, empty state) yang pakai key baru.
  activity_heading: { id: 'Aktivitas', en: 'Activity' },
  activity_loading: { id: 'Memuat aktivitas...', en: 'Loading activity...' },
  activity_empty: { id: 'Belum ada aktivitas.', en: 'No activity yet.' },
  activity_filter_aria: { id: 'Filter aktivitas', en: 'Filter activity' },
  activity_filter_all: { id: 'Semua', en: 'All' },
  activity_filter_comments: { id: 'Komentar', en: 'Comments' },
  activity_filter_history: { id: 'Perubahan', en: 'Changes' },
  // {n} diganti lewat .replace() di client (pola sama seperti notif_task_assigned).
  activity_show_older: { id: 'Tampilkan {n} aktivitas lama', en: 'Show {n} older activities' },
  activity_hide_older: { id: 'Sembunyikan aktivitas lama', en: 'Hide older activities' },

  // Halaman Audit Log.
  audit_page_title: { id: 'Audit Log', en: 'Audit Log' },
  audit_subtitle: {
    id: 'Jejak semua aksi Tambah/Ubah/Hapus di Master Data, Users, Tasks, dan perubahan hak akses menu.',
    en: 'Trail of all Create/Update/Delete actions in Master Data, Users, Tasks, and menu access changes.',
  },
  audit_export_csv: { id: 'Export CSV', en: 'Export CSV' },
  audit_reset_filter: { id: 'Reset Filter', en: 'Reset Filter' },
  audit_search_label: { id: 'Cari (nama data)', en: 'Search (record name)' },
  audit_search_placeholder: { id: 'Ketik nama data...', en: 'Type record name...' },
  audit_type_label: { id: 'Tipe Data', en: 'Data Type' },
  audit_option_all: { id: '-- Semua --', en: '-- All --' },
  audit_action_label: { id: 'Aksi', en: 'Action' },
  audit_action_create: { id: 'Tambah', en: 'Create' },
  audit_action_update: { id: 'Ubah', en: 'Update' },
  audit_action_delete: { id: 'Hapus', en: 'Delete' },
  audit_actor_label: { id: 'Pelaku', en: 'Actor' },
  audit_date_from_label: { id: 'Dari Tanggal', en: 'From Date' },
  audit_date_to_label: { id: 'Sampai Tanggal', en: 'To Date' },
  audit_col_time: { id: 'Waktu', en: 'Time' },
  audit_col_actor: { id: 'Pelaku', en: 'Actor' },
  audit_col_action: { id: 'Aksi', en: 'Action' },
  audit_col_type: { id: 'Tipe', en: 'Type' },
  audit_col_data: { id: 'Data', en: 'Record' },
  audit_col_detail: { id: 'Detail', en: 'Detail' },
  audit_no_match: { id: 'Tidak ada log yang cocok dengan filter.', en: 'No log entries match the filter.' },
  toast_audit_load_failed: { id: 'Gagal memuat audit log.', en: 'Failed to load audit log.' },

  // Task Detail Modal — form terbesar di aplikasi (permintaan user: sweep i18n menyeluruh).
  td_task_fallback_title: { id: 'Task', en: 'Task' },
  td_close: { id: 'Tutup', en: 'Close' },
  td_tt_not_configured: {
    id: 'Time Tracking belum dikonfigurasi di server ini.',
    en: 'Time Tracking has not been configured on this server.',
  },
  td_tt_state_running: { id: 'Berjalan', en: 'Running' },
  td_tt_state_paused: { id: 'Dijeda', en: 'Paused' },
  td_tt_state_not_started: { id: 'Belum dimulai', en: 'Not started' },
  td_current_session: { id: 'Sesi Saat Ini', en: 'Current Session' },
  td_cancel_task_btn: { id: 'Batalkan Task', en: 'Cancel Task' },
  td_work_session_label: { id: 'Sesi Kerja', en: 'Work Session' },
  td_review_session_label: { id: 'Sesi Review', en: 'Review Session' },
  td_no_time_recorded: { id: 'Belum ada waktu yang tercatat.', en: 'No time recorded yet.' },
  td_col_start_resume: { id: 'Mulai/Lanjut', en: 'Start/Resume' },
  td_col_pause_stop: { id: 'Jeda/Stop', en: 'Pause/Stop' },
  td_col_back_done: { id: 'Kembali/Selesai', en: 'Back/Done' },
  td_col_duration: { id: 'Durasi', en: 'Duration' },
  td_actor_you: { id: 'Anda', en: 'You' },
  td_actor_other: { id: 'User Lain', en: 'Other User' },
  td_locked_notice: {
    id: 'Detail task ini terkunci karena status sudah bukan To Do lagi. Status hanya bisa berubah lewat tombol aksi di panel Time Tracking (Start/Pause/Stop/Back/Done), Cancel Task, atau drag & drop kartu di Kanban — bukan lewat form ini.',
    en: 'This task detail is locked because its status is no longer To Do. Status can only change via the action buttons in the Time Tracking panel (Start/Pause/Stop/Back/Done), Cancel Task, or drag & drop on the Kanban board — not through this form.',
  },
  // Redesign Round 10 lanjutan (layout total ala Saran 4): judul kecil di atas section field
  // ringkas (ikon + label + kontrol) di kolom kiri modal.
  td_fields_section_title: { id: 'Fields', en: 'Fields' },
  td_field_title: { id: 'Judul', en: 'Title' },
  td_field_title_placeholder: { id: 'Contoh: Perbaiki bug login di halaman utama', en: 'e.g., Fix login bug on the main page' },
  td_field_description: { id: 'Deskripsi', en: 'Description' },
  td_field_description_placeholder: {
    id: 'Jelaskan detail tugas ini, langkah pengerjaan, atau referensi yang dibutuhkan...',
    en: 'Describe the task details, steps, or references needed...',
  },
  td_field_project: { id: 'Proyek', en: 'Project' },
  td_field_client: { id: 'Klien (opsional)', en: 'Client (optional)' },
  td_field_priority: { id: 'Prioritas *', en: 'Priority *' },
  td_field_task_type: { id: 'Tipe Tugas *', en: 'Task Type *' },
  td_field_related_task: { id: 'Task Terkait *', en: 'Related Task *' },
  td_field_assignee: { id: 'Assignee', en: 'Assignee' },
  td_field_start_date: { id: 'Tanggal Mulai', en: 'Start Date' },
  td_field_due_date: { id: 'Tanggal Jatuh Tempo', en: 'Due Date' },
  td_field_est_hours: { id: 'Estimasi Jam', en: 'Est. Hours' },
  td_est_hours_placeholder: { id: 'mis. 8', en: 'e.g., 8' },
  td_option_none: { id: '-- Tidak ada --', en: '-- None --' },
  td_option_choose: { id: '-- Pilih --', en: '-- Select --' },
  td_option_choose_task_type: { id: '-- Pilih Task Type --', en: '-- Select Task Type --' },
  td_option_choose_task: { id: '-- Pilih Task --', en: '-- Select Task --' },
  td_option_self: { id: '-- Diri sendiri --', en: '-- Myself --' },
  td_assign_to_me: { id: 'Tugaskan ke saya', en: 'Assign to me' },
  td_created_label: { id: 'Dibuat', en: 'Created' },
  td_updated_label: { id: 'Terakhir diperbarui', en: 'Last updated' },
  toast_load_task_failed: { id: 'Gagal memuat task.', en: 'Failed to load task.' },
  toast_load_options_failed: { id: 'Gagal memuat opsi.', en: 'Failed to load options.' },
  toast_no_cancel_status: {
    id: 'Tidak ada status "Cancelled" yang dikonfigurasi di Master Status.',
    en: 'No "Cancelled" status is configured in Master Status.',
  },
  confirm_cancel_task_prefix: { id: 'Batalkan task', en: 'Cancel task' },
  confirm_cancel_task_suffix: { id: 'Status akan diubah ke', en: 'Status will change to' },
  toast_cancel_task_failed: { id: 'Gagal membatalkan task.', en: 'Failed to cancel task.' },
  toast_cancel_task_success: { id: 'Task berhasil dibatalkan.', en: 'Task cancelled successfully.' },
  toast_save_task_failed: { id: 'Gagal menyimpan data.', en: 'Failed to save data.' },
  toast_save_task_success: { id: 'Perubahan task berhasil disimpan.', en: 'Task changes saved successfully.' },
  // Perbaikan (permintaan user, item concurrency): pesan fallback kalau server menolak simpan
  // karena task sudah diubah user lain sejak dimuat (409, lihat OptimisticLockError).
  toast_save_conflict: {
    id: 'Task ini sudah diubah oleh user lain sejak Anda membuka halaman ini. Muat ulang untuk melihat perubahan terbaru.',
    en: 'This task was already changed by someone else since you opened it. Reload to see the latest changes.',
  },

  // Tasks List (tabel) — kolom, empty state, form Tambah Task, toast.
  col_title: { id: 'Judul', en: 'Title' },
  col_project: { id: 'Proyek', en: 'Project' },
  col_priority: { id: 'Prioritas', en: 'Priority' },
  col_status: { id: 'Status', en: 'Status' },
  col_assignee: { id: 'Assignee', en: 'Assignee' },
  col_actions: { id: 'Aksi', en: 'Actions' },
  tasks_subtitle_total: { id: 'Total', en: 'Total' },
  tasks_word_singular: { id: 'task', en: 'task' },
  tasks_word_plural: { id: 'task', en: 'tasks' },
  tasks_empty: { id: 'Belum ada task.', en: 'No tasks yet.' },
  tasks_no_match: {
    id: 'Tidak ada task yang cocok dengan pencarian/filter.',
    en: 'No tasks match the search/filter.',
  },
  action_detail: { id: 'Detail', en: 'Detail' },
  toast_load_data_failed: { id: 'Gagal memuat data.', en: 'Failed to load data.' },
  toast_task_created: { id: 'Task baru berhasil ditambahkan.', en: 'New task added successfully.' },
  confirm_delete_task_prefix: { id: 'Hapus task', en: 'Delete task' },
  toast_delete_data_failed: { id: 'Gagal menghapus data.', en: 'Failed to delete data.' },
  toast_task_deleted_prefix: { id: 'Task', en: 'Task' },
  toast_task_deleted_suffix: { id: 'berhasil dihapus.', en: 'deleted successfully.' },
  tasks_add_modal_title: { id: 'Tambah Task', en: 'Add Task' },
  tf_title: { id: 'Judul *', en: 'Title *' },
  tf_client: { id: 'Client *', en: 'Client *' },
  tf_project: { id: 'Project *', en: 'Project *' },
  tf_option_choose_client: { id: '-- Pilih Client --', en: '-- Select Client --' },
  tf_option_choose_project: { id: '-- Pilih Project --', en: '-- Select Project --' },
  tf_option_choose_client_first: { id: '-- Pilih Client dahulu --', en: '-- Select a Client first --' },
  tf_self_no_permission: {
    id: 'Diri sendiri (Anda tidak punya hak menugaskan ke user lain)',
    en: 'Myself (you do not have permission to assign to other users)',
  },

  // Kanban Board.
  toast_kanban_drag_invalid: {
    id: 'Drag di Kanban hanya boleh menggeser task persis satu tahap ke depan. Untuk mundur, gunakan form Edit.',
    en: 'Kanban drag can only move a task exactly one stage forward. To move backward, use the Edit form.',
  },
  toast_move_task_failed: { id: 'Gagal memindahkan task.', en: 'Failed to move task.' },
  toast_task_moved_prefix: { id: 'Task dipindahkan ke', en: 'Task moved to' },
  kanban_no_tasks: { id: 'Tidak ada task', en: 'No tasks' },
  kanban_due_prefix: { id: 'Jatuh tempo', en: 'Due' },
  kanban_est_prefix: { id: 'Estimasi', en: 'Est' },

  // Calendar View.
  calendar_due_this_month_suffix: { id: 'jatuh tempo bulan ini', en: 'due this month' },
  calendar_prev_month_aria: { id: 'Bulan sebelumnya', en: 'Previous month' },
  calendar_next_month_aria: { id: 'Bulan berikutnya', en: 'Next month' },
  calendar_today_btn: { id: 'Hari Ini', en: 'Today' },
  calendar_more_suffix: { id: 'lagi', en: 'more' },
  calendar_unscheduled_title: { id: 'Belum Terjadwal', en: 'Unscheduled' },
  calendar_unscheduled_subtitle: { id: 'Task tanpa Due Date', en: 'Tasks without a Due Date' },
  calendar_unscheduled_empty: { id: 'Semua task sudah punya due date.', en: 'All tasks already have a due date.' },

  // Master Data — nama entity singular (dipakai gabungan dengan action_add/action_edit dll, mis.
  // "Tambah Role"), pageTitle, subtitleTemplate, dan field-field per entity.
  md_entity_label_roles: { id: 'Role', en: 'Role' },
  md_entity_label_employment_types: { id: 'Tipe Kepegawaian', en: 'Employment Type' },
  md_entity_label_clients: { id: 'Klien', en: 'Client' },
  md_entity_label_projects: { id: 'Proyek', en: 'Project' },
  md_entity_label_priorities: { id: 'Prioritas', en: 'Priority' },
  md_entity_label_task_types: { id: 'Tipe Tugas', en: 'Task Type' },
  md_title_roles: { id: 'Master Role', en: 'Master Role' },
  md_title_employment_types: { id: 'Tipe Kepegawaian', en: 'Employment Type' },
  md_title_clients: { id: 'Klien', en: 'Client' },
  md_title_projects: { id: 'Proyek', en: 'Project' },
  md_title_priorities: { id: 'Prioritas', en: 'Priority' },
  md_title_task_types: { id: 'Tipe Tugas', en: 'Task Type' },
  md_title_statuses: { id: 'Status', en: 'Status' },
  md_subtitle_roles: { id: '{count} role total', en: '{count} roles total' },
  md_subtitle_generic: { id: '{count} data total', en: '{count} total records' },
  md_field_role_name: { id: 'Nama Role', en: 'Role Name' },
  md_ph_role_name: { id: 'Contoh: Project Manager', en: 'e.g., Project Manager' },
  md_ph_role_description: {
    id: 'Contoh: Mengelola proyek, menugaskan task, dan memantau progres tim.',
    en: 'e.g., Manages projects, assigns tasks, and monitors team progress.',
  },
  md_field_employment_type_name: { id: 'Nama Tipe Kepegawaian', en: 'Employment Type Name' },
  md_ph_employment_type_name: { id: 'Contoh: Full-time', en: 'e.g., Full-time' },
  md_field_can_assign_others: { id: 'Boleh Menugaskan ke User Lain', en: 'May Assign Tasks to Other Users' },
  md_help_can_assign_others: {
    id: 'Jika diaktifkan, tipe kepegawaian ini ditandai berhak menugaskan task ke user lain. User dengan tipe kepegawaian ini tetap harus diizinkan satu per satu lewat pertanyaan "Apakah user ini boleh menugaskan task ke user lain?" di Master User.',
    en: 'When enabled, this employment type is set as eligible to assign tasks to other users. Users with this employment type still need to be individually authorized via the "Is this user allowed to assign tasks to other users?" question on Master User.',
  },
  md_field_client_name: { id: 'Nama Klien', en: 'Client Name' },
  md_ph_client_name: { id: 'Contoh: PT Maju Bersama', en: 'e.g., Acme Corp' },
  md_field_project_ids: { id: 'Project Terkait', en: 'Related Projects' },
  md_help_project_ids: {
    id: 'Pilih project yang terkait dengan client ini. Saat menambah Task, pilihan Project akan otomatis terfilter berdasarkan Client yang dipilih.',
    en: 'Select the projects related to this client. When adding a Task, the Project choices will automatically filter based on the selected Client.',
  },
  md_field_project_name: { id: 'Nama Proyek', en: 'Project Name' },
  md_ph_project_name: { id: 'Contoh: Website Redesign 2026', en: 'e.g., Website Redesign 2026' },
  md_field_priority_name: { id: 'Nama Prioritas', en: 'Priority Name' },
  md_ph_priority_name: { id: 'Contoh: Urgent', en: 'e.g., Urgent' },
  md_field_level: { id: 'Urutan (angka)', en: 'Order (number)' },
  md_ph_level: { id: 'Contoh: 1', en: 'e.g., 1' },
  md_field_color_code: { id: 'Kode Warna', en: 'Color Code' },
  md_help_color_priority: { id: 'Ditampilkan sebagai warna badge Priority.', en: 'Shown as the Priority badge color.' },
  md_field_task_type_name: { id: 'Nama Tipe Tugas', en: 'Task Type Name' },
  md_ph_task_type_name: { id: 'Contoh: Bug Fix', en: 'e.g., Bug Fix' },
  md_field_requires_related_task: { id: 'Membutuhkan Task Terkait', en: 'Requires Related Task' },
  md_help_requires_related_task: {
    id: 'Jika dicentang, setiap task yang dibuat/diubah dengan tipe tugas ini wajib memilih task yang sudah ada sebagai referensi Task Terkait (mis. tipe "Revisi" yang menunjuk balik ke task yang direvisi).',
    en: 'When checked, every task created or edited with this task type must select an existing task as its Related Task reference (e.g. a "Revision" type that points back to the task being revised).',
  },
  md_field_status_name: { id: 'Nama Status', en: 'Status Name' },
  md_ph_status_name: { id: 'Contoh: In Progress', en: 'e.g., In Progress' },
  md_field_sort_order: { id: 'Urutan', en: 'Order' },
  md_help_color_status: {
    id: 'Ditampilkan sebagai warna kolom Kanban / badge status.',
    en: 'Shown as the Kanban column / status badge color.',
  },
  md_field_workflow_level: { id: 'Urutan Workflow', en: 'Workflow Level' },
  md_ph_workflow_level: {
    id: 'Contoh: 1 (kosongkan utk status seperti Cancelled)',
    en: 'e.g., 1 (leave blank for statuses like Cancelled)',
  },
  md_help_workflow_level: {
    id: 'Posisi dalam workflow linear (1, 2, 3, ...) yang dipakai untuk mencegah lompat tahap (mis. To Do → Complete). Kosongkan untuk status seperti Cancelled yang bisa dimasuki/keluar kapan saja.',
    en: 'Position in the linear workflow (1, 2, 3, ...) used to prevent level skipping (e.g. To Do → Complete). Leave blank for statuses like Cancelled that a task can enter/exit at any time.',
  },
  md_field_is_default: { id: 'Status Default (Awal Task Baru)', en: 'Default Status (New Task Start)' },
  md_help_is_default: {
    id: 'Mengaktifkan opsi ini akan menonaktifkan flag default pada status yang saat ini memilikinya.',
    en: 'Enabling this option will disable the default flag on the status that currently has it.',
  },
  md_field_is_final: { id: 'Status Final', en: 'Final Status' },
  md_help_is_final: { id: 'Status final (menandai task sebagai selesai).', en: 'Final status (marks a task as complete).' },
  md_field_is_review: { id: 'Status Review (Time Tracking)', en: 'Review Status (Time Tracking)' },
  md_help_is_review: {
    id: 'Dipakai untuk memisahkan waktu kerja (Work) dan waktu review pada Time Tracking.',
    en: 'Used to separate work time and review time in Time Tracking.',
  },

  // Master Data — chrome UI generik (tabel, modal, toast) di master-data-table.tsx.
  md_export_csv: { id: 'Export CSV', en: 'Export CSV' },
  md_import_csv: { id: 'Import CSV', en: 'Import CSV' },
  md_importing: { id: 'Mengimpor...', en: 'Importing...' },
  md_search_placeholder_prefix: { id: 'Cari', en: 'Search' },
  md_col_kanban_order: { id: 'Urutan Kanban', en: 'Kanban Order' },
  md_col_name: { id: 'Nama', en: 'Name' },
  md_col_markers: { id: 'Penanda', en: 'Markers' },
  md_badge_default: { id: 'Default', en: 'Default' },
  md_badge_final: { id: 'Final', en: 'Final' },
  md_badge_system: { id: 'Bawaan Sistem', en: 'Built-in' },
  md_system_row_delete_title: { id: 'Data bawaan sistem tidak bisa dihapus', en: 'Built-in data cannot be deleted' },
  md_no_data: { id: 'Belum ada data.', en: 'No data yet.' },
  md_no_match: { id: 'Tidak ada data yang cocok dengan pencarian.', en: 'No data matches the search.' },
  md_field_disabled_note: { id: '(tidak bisa diubah)', en: '(cannot be changed)' },
  md_option_choose: { id: '-- Pilih --', en: '-- Select --' },
  md_no_data_short: { id: 'Belum ada data.', en: 'No data yet.' },
  toast_update_success_suffix: { id: 'berhasil diperbarui.', en: 'updated successfully.' },
  toast_create_success_suffix: { id: 'baru berhasil ditambahkan.', en: 'added successfully.' },
  confirm_delete_generic_prefix: { id: 'Hapus', en: 'Delete' },
  toast_reassign_delete_failed: { id: 'Gagal memindahkan & menghapus data.', en: 'Failed to reassign & delete data.' },
  toast_reassign_delete_success_suffix: { id: 'berhasil dipindahkan & dihapus.', en: 'reassigned & deleted successfully.' },
  toast_reorder_failed: { id: 'Gagal mengubah urutan.', en: 'Failed to change order.' },
  toast_reorder_success: { id: 'Urutan berhasil diubah.', en: 'Order changed successfully.' },
  md_detail_suffix: { id: 'Detail', en: 'Detail' },
  md_import_result_title: { id: 'Hasil Import CSV', en: 'CSV Import Results' },
  md_import_result_success: { id: 'berhasil', en: 'succeeded' },
  md_import_result_failed: { id: 'gagal', en: 'failed' },
  md_import_result_from: { id: 'dari', en: 'out of' },
  md_import_result_rows: { id: 'baris.', en: 'rows.' },
  md_import_col_row: { id: 'Baris', en: 'Row' },
  md_import_col_data: { id: 'Data', en: 'Data' },
  md_import_col_note: { id: 'Keterangan', en: 'Note' },
  md_import_empty_csv: { id: 'File CSV kosong atau tidak punya baris data.', en: 'The CSV file is empty or has no data rows.' },
  md_import_not_found_related: { id: 'tidak ditemukan di data master terkait.', en: 'was not found in the related master data.' },
  md_import_not_found_options: { id: 'tidak ditemukan di pilihan yang valid.', en: 'was not found among the valid options.' },
  md_import_save_failed: { id: 'Gagal menyimpan.', en: 'Failed to save.' },
  md_import_row_label: { id: 'baris', en: 'row' },
  md_import_row_success: { id: 'Berhasil ditambahkan.', en: 'Added successfully.' },
  toast_import_done_success: { id: 'Import selesai — {ok} baris berhasil ditambahkan.', en: 'Import finished — {ok} rows added successfully.' },
  toast_import_done_mixed: {
    id: 'Import selesai — {ok} berhasil, {fail} gagal. Lihat rincian di ringkasan.',
    en: 'Import finished — {ok} succeeded, {fail} failed. See the summary for details.',
  },
  md_delete_blocked_title: { id: 'Tidak Bisa Dihapus Langsung', en: 'Cannot Delete Directly' },
  md_replace_with_prefix: { id: 'Ganti dengan', en: 'Replace with' },
  md_option_choose_replacement_prefix: { id: '-- Pilih', en: '-- Select' },
  md_option_choose_replacement_suffix: { id: 'pengganti --', en: 'replacement --' },
  md_reassign_note_prefix: {
    id: 'Semua data yang masih memakai',
    en: 'All data that still uses',
  },
  md_reassign_note_suffix: {
    id: 'akan dipindahkan ke pilihan di atas, baru kemudian',
    en: 'will be moved to the choice above, then',
  },
  md_reassign_note_end: { id: 'dihapus.', en: 'will be deleted.' },
  md_reassign_processing: { id: 'Memproses...', en: 'Processing...' },
  md_reassign_confirm_btn: { id: 'Ganti & Hapus', en: 'Reassign & Delete' },

  // Halaman Master User.
  u_subtitle: { id: '{count} total user', en: '{count} total users' },
  u_search_placeholder: { id: 'Cari nama, email, departemen...', en: 'Search name, email, department...' },
  u_col_email: { id: 'Email', en: 'Email' },
  u_col_department: { id: 'Departemen', en: 'Department' },
  u_col_role: { id: 'Role', en: 'Role' },
  u_col_employment_type: { id: 'Tipe Kepegawaian', en: 'Employment Type' },
  u_col_can_assign: { id: 'Boleh Menugaskan', en: 'Can Assign' },
  u_must_change_password_badge: { id: 'Belum ganti password', en: 'Password not changed yet' },
  u_modal_edit_title: { id: 'Edit User', en: 'Edit User' },
  u_modal_add_title: { id: 'Tambah User', en: 'Add User' },
  u_field_full_name: { id: 'Nama Lengkap *', en: 'Full Name *' },
  u_ph_full_name: { id: 'Contoh: Budi Santoso', en: 'e.g. Budi Santoso' },
  u_field_email: { id: 'Alamat Email *', en: 'Email Address *' },
  u_ph_email: { id: 'nama@perusahaan.com', en: 'name@company.com' },
  u_field_phone: { id: 'Telepon', en: 'Phone' },
  u_ph_phone: { id: 'Contoh: 081234567890', en: 'e.g. 081234567890' },
  u_ph_department: { id: 'Contoh: Marketing', en: 'e.g. Marketing' },
  u_field_photo: { id: 'Foto', en: 'Photo' },
  u_field_role: { id: 'Role *', en: 'Role *' },
  u_option_choose_role: { id: '-- Pilih Role --', en: '-- Select Role --' },
  status_active_label: { id: 'Aktif', en: 'Active' },
  status_inactive_label: { id: 'Tidak Aktif', en: 'Inactive' },
  u_field_status: { id: 'Status *', en: 'Status *' },
  u_field_employment_type: { id: 'Tipe Kepegawaian *', en: 'Employment Type *' },
  u_option_choose_employment_type: { id: '-- Pilih tipe kepegawaian... --', en: '-- Select an employment type... --' },
  u_field_can_assign_question: {
    id: 'Apakah user ini boleh menugaskan task ke user lain?',
    en: 'Is this user allowed to assign tasks to other users?',
  },
  u_can_assign_help: {
    id: 'Jika "Ya", user ini bisa menugaskan task ke user lain selain dirinya sendiri di halaman Tambah/Edit Task. Jika "Tidak", user ini hanya bisa menugaskan task ke dirinya sendiri.',
    en: 'If "Yes", this user can assign tasks to other users besides themselves on the Add/Edit Task page. If "No", this user can only assign tasks to themselves.',
  },
  u_field_password: { id: 'Kata Sandi', en: 'Password' },
  u_password_keep_note: { id: '(kosongkan jika tidak diubah)', en: '(leave blank to keep unchanged)' },
  u_ph_password_edit: { id: 'Kosongkan jika tidak diubah', en: 'Leave blank to keep unchanged' },
  u_ph_password_new: { id: 'Minimal 8 karakter', en: 'At least 8 characters' },
  u_save_create_btn: { id: 'Buat User', en: 'Create User' },
  u_detail_title: { id: 'Detail User', en: 'User Detail' },
  u_import_note: {
    id: 'Catat password sementara di bawah sebelum menutup jendela ini — tidak ditampilkan lagi setelahnya.',
    en: 'Note down the temporary passwords below before closing this window — they will not be shown again afterward.',
  },
  u_import_not_found_suffix: { id: 'tidak ditemukan.', en: 'was not found.' },
  u_import_success_prefix: { id: 'Berhasil. Password sementara:', en: 'Success. Temporary password:' },
  u_import_success_suffix: {
    id: '— wajib diganti user saat login pertama.',
    en: '— the user must change it on first login.',
  },
  toast_import_users_done_success: {
    id: 'Import selesai — {ok} user berhasil ditambahkan.',
    en: 'Import finished — {ok} users added successfully.',
  },
  u_entity_word: { id: 'User', en: 'User' },
  toast_user_updated: { id: 'Perubahan user berhasil disimpan.', en: 'User changes saved successfully.' },
  toast_user_created: { id: 'User baru berhasil ditambahkan.', en: 'New user added successfully.' },

  // Halaman Profil Saya.
  profile_data_section_title: { id: 'Data Profil', en: 'Profile Data' },
  profile_field_name: { id: 'Nama *', en: 'Name *' },
  profile_field_email: { id: 'Email *', en: 'Email *' },
  profile_save_btn: { id: 'Simpan Profil', en: 'Save Profile' },
  toast_load_profile_failed: { id: 'Gagal memuat profil.', en: 'Failed to load profile.' },
  toast_save_profile_failed: { id: 'Gagal menyimpan profil.', en: 'Failed to save profile.' },
  toast_profile_saved: { id: 'Profil berhasil disimpan.', en: 'Profile saved successfully.' },
  profile_password_section_title: { id: 'Ganti Password', en: 'Change Password' },
  profile_password_section_subtitle: {
    id: 'Wajib memasukkan password saat ini untuk verifikasi.',
    en: 'You must enter your current password to verify.',
  },
  profile_field_current_password: { id: 'Password Saat Ini', en: 'Current Password' },
  profile_ph_current_password: { id: 'Masukkan password Anda saat ini', en: 'Enter your current password' },
  profile_field_new_password: { id: 'Password Baru', en: 'New Password' },
  profile_field_confirm_password: { id: 'Konfirmasi Password Baru', en: 'Confirm New Password' },
  profile_ph_confirm_password: { id: 'Ulangi password baru', en: 'Repeat the new password' },
  toast_password_mismatch: { id: 'Konfirmasi password tidak cocok.', en: 'Password confirmation does not match.' },
  toast_change_password_failed: { id: 'Gagal mengganti password.', en: 'Failed to change password.' },
  toast_password_changed: { id: 'Password berhasil diganti.', en: 'Password changed successfully.' },

  // Halaman Report.
  reports_btn_print: { id: 'Cetak', en: 'Print' },
  reports_btn_export: { id: 'Export', en: 'Export' },
  reports_label_user: { id: 'User', en: 'User' },
  reports_option_all_users: { id: 'Semua User', en: 'All Users' },
  reports_label_period: { id: 'Periode', en: 'Period' },
  reports_period_daily: { id: 'Harian', en: 'Daily' },
  reports_period_weekly: { id: 'Mingguan', en: 'Weekly' },
  reports_period_monthly: { id: 'Bulanan', en: 'Monthly' },
  reports_period_yearly: { id: 'Tahunan', en: 'Yearly' },
  reports_label_select_date: { id: 'Pilih Tanggal', en: 'Select Date' },
  reports_label_select_week: { id: 'Pilih Minggu', en: 'Select Week' },
  reports_label_select_month: { id: 'Pilih Bulan', en: 'Select Month' },
  reports_label_select_year: { id: 'Pilih Tahun', en: 'Select Year' },
  reports_ph_year: { id: 'Contoh: 2026', en: 'e.g. 2026' },
  toast_reports_period_invalid: {
    id: 'Nilai periode belum lengkap/valid.',
    en: 'Period value is incomplete or invalid.',
  },
  reports_card_total_tasks: { id: 'Total Tugas', en: 'Total Tasks' },
  reports_card_done: { id: 'Selesai', en: 'Done' },
  reports_card_pending: { id: 'Pending', en: 'Pending' },
  reports_card_overdue: { id: 'Terlambat', en: 'Overdue' },
  reports_card_completion_rate: { id: 'Tingkat Penyelesaian', en: 'Completion Rate' },
  reports_card_hours_worked: { id: 'Jam Kerja', en: 'Hours Worked' },
  reports_card_avg_duration: { id: 'Rata-rata Durasi', en: 'Average Duration' },
  reports_chart_task_status: { id: 'Status Tugas', en: 'Task Status' },
  reports_chart_priority_distribution: { id: 'Distribusi Prioritas', en: 'Priority Distribution' },
  reports_chart_due_date_trend: { id: 'Tren Tenggat Waktu', en: 'Due Date Trend' },
  reports_table_heading: { id: 'Tabel Tugas', en: 'Task Table' },
  reports_table_word_singular: { id: 'task', en: 'task' },
  reports_table_word_plural: { id: 'task', en: 'tasks' },
  reports_table_in_range_suffix: { id: 'dalam rentang', en: 'in range' },
  reports_empty_state: { id: 'Tidak ada task pada rentang ini.', en: 'No tasks in this range.' },
  toast_reports_load_failed: { id: 'Gagal memuat data laporan.', en: 'Failed to load report data.' },
  reports_pdf_title: { id: 'Laporan — TMS', en: 'Report — TMS' },
  reports_pdf_printed_label: { id: 'Dicetak', en: 'Printed' },
  reports_pdf_total_label: { id: 'Total', en: 'Total' },

  // Widget AvatarEditor (upload + crop foto profil) — dipakai di Master User & Profil Saya.
  avatar_default_label: { id: 'Foto Profil', en: 'Profile Photo' },
  avatar_err_load_image: { id: 'Gagal memuat gambar.', en: 'Failed to load image.' },
  avatar_err_read_file: { id: 'Gagal membaca file gambar.', en: 'Failed to read image file.' },
  avatar_err_canvas_unsupported: {
    id: 'Canvas tidak didukung browser ini.',
    en: 'Canvas is not supported in this browser.',
  },
  avatar_err_process_failed: { id: 'Gagal memproses gambar.', en: 'Failed to process image.' },
  avatar_btn_change: { id: 'Ganti Foto', en: 'Change Photo' },
  avatar_btn_choose: { id: 'Pilih Foto', en: 'Choose Photo' },
  avatar_btn_remove: { id: 'Hapus Foto', en: 'Remove Photo' },
  avatar_hint_filetypes: { id: 'JPG, PNG, GIF, atau WEBP. Maks 2MB.', en: 'JPG, PNG, GIF, or WEBP. Max 2MB.' },
  avatar_crop_modal_title: { id: 'Atur Posisi & Crop Foto', en: 'Adjust Position & Crop Photo' },
  avatar_crop_modal_subtitle: {
    id: 'Geser foto untuk mengatur posisi, gunakan slider untuk memperbesar/memperkecil.',
    en: 'Drag the photo to adjust its position, use the slider to zoom in/out.',
  },
  avatar_zoom_label: { id: 'Zoom', en: 'Zoom' },
  avatar_processing: { id: 'Memproses...', en: 'Processing...' },
  avatar_preview_alt: { id: 'Preview foto profil', en: 'Profile photo preview' },

  // Halaman Menu Access — pesan error/sukses yang belum sempat di-i18n-kan di round sebelumnya.
  toast_menu_access_load_roles_failed: { id: 'Gagal memuat daftar role.', en: 'Failed to load role list.' },
  toast_menu_access_load_matrix_failed: { id: 'Gagal memuat hak akses.', en: 'Failed to load access rights.' },
  toast_menu_access_save_failed: { id: 'Gagal menyimpan hak akses.', en: 'Failed to save access rights.' },
  toast_menu_access_saved: { id: 'Hak akses berhasil disimpan.', en: 'Access rights saved successfully.' },

  // Toast global (ToastProvider) — tombol tutup notifikasi.
  toast_close_aria: { id: 'Tutup notifikasi', en: 'Close notification' },

  // Halaman Login — sisa string yang belum di-i18n-kan (panel brand, hero text, form chrome).
  login_brand_name: { id: 'Task Management System', en: 'Task Management System' },
  login_hero_line1: { id: 'Rencanakan pekerjaan.', en: 'Plan your work.' },
  login_hero_line2: { id: 'Pantau kemajuannya.', en: 'Track its progress.' },
  login_hero_line3: { id: 'Selesaikan tepat waktu.', en: 'Finish on time.' },
  login_hero_subtitle: {
    id: 'Satu ruang kerja yang rapi untuk tugas, pelacakan waktu, dan pelaporan tim Anda.',
    en: 'One tidy workspace for your team’s tasks, time tracking, and reporting.',
  },
  login_welcome_title: { id: 'Selamat datang kembali', en: 'Welcome back' },
  login_welcome_subtitle: {
    id: 'Masuk untuk melanjutkan ke ruang kerja Anda.',
    en: 'Sign in to continue to your workspace.',
  },
  login_toggle_password_aria: { id: 'Tampilkan/sembunyikan kata sandi', en: 'Show/hide password' },
  login_remember_me: { id: 'Ingat saya', en: 'Remember me' },
  login_forgot_password: { id: 'Lupa kata sandi?', en: 'Forgot password?' },
  toast_login_reset_unavailable: {
    id: 'Fitur reset kata sandi mandiri belum tersedia. Hubungi admin untuk reset password Anda.',
    en: 'Self-service password reset is not available yet. Contact your admin to reset your password.',
  },
  toast_login_failed: { id: 'Login gagal.', en: 'Login failed.' },

  // Halaman wajib ganti password (dipaksa untuk user hasil Import CSV) — sebelumnya belum ada i18n
  // sama sekali di halaman ini.
  change_password_intro: {
    id: 'Akun Anda dibuat dengan password sementara. Silakan ganti dengan password pilihan Anda sendiri sebelum melanjutkan.',
    en: 'Your account was created with a temporary password. Please change it to a password of your own choosing before continuing.',
  },
  change_password_ph_current: { id: 'Masukkan password sementara Anda', en: 'Enter your temporary password' },
  change_password_ph_new: { id: 'Minimal 8 karakter', en: 'Minimum 8 characters' },
  change_password_submit_btn: { id: 'Simpan & Lanjutkan', en: 'Save & Continue' },

  // Fitur Leader Role + pembatasan visibilitas Task (permintaan user): field baru Master Role,
  // tombol "Lihat" (view-only, beda dari "Detail" yang bisa diedit), dan blok info Pemberi
  // Tugas/Ditugaskan Kepada di Task Detail (hanya muncul kalau task-nya benar-benar penunjukan
  // tugas dari satu user ke user lain).
  md_field_is_leader: { id: 'Pemimpin (Leader)', en: 'Leader' },
  // Perbaikan (permintaan user poin 1, 3 & 5): teks ini DIPERBARUI membalik kebijakan sebelumnya
  // — Pemimpin sekarang bisa MENGELOLA PENUH (bukan cuma melihat) seluruh task siapa pun,
  // termasuk mengubah task yang ditugaskan ke user lain.
  md_help_is_leader: {
    id: 'Role dengan tanda ini tidak bisa ditugaskan task oleh siapa pun kecuali dirinya sendiri atau Admin, otomatis boleh menugaskan task ke semua user kecuali Admin, dan bisa MENGAKSES SERTA MENGELOLA seluruh task milik user lain (bukan hanya melihat) — termasuk mengubah informasi, menjalankan Time Tracking, dan menghapus task siapa pun. Tidak bisa dicentang bersamaan dengan "Admin".',
    en: 'Roles marked this way can only be assigned a task by themselves or by an Admin, can automatically assign tasks to every user except Admin, and can ACCESS AND FULLY MANAGE every other user’s tasks (not just view them) — including editing task info, running Time Tracking, and deleting anyone’s tasks. Cannot be checked together with "Admin".',
  },
  // Perbaikan Admin/Leader (permintaan user): field baru "Is Admin" di Master Role — role lain
  // selain role_key bawaan sistem 'admin' juga bisa diberi hak Admin PENUH, 100% identik, di
  // seluruh aplikasi. Mutually exclusive dengan "Is Leader" di atas (hanya bisa pilih salah satu).
  md_field_is_admin: { id: 'Admin', en: 'Admin' },
  md_help_is_admin: {
    id: 'Role dengan tanda ini mendapat hak akses PENUH setara Admin di seluruh aplikasi — bisa mengelola Master Data & Users, melihat serta mengelola semua Task, dan menugaskan task ke siapa saja kecuali Admin lain (hanya bisa menugaskan dirinya sendiri). Tidak bisa dicentang bersamaan dengan "Pemimpin (Leader)".',
    en: 'Roles marked this way get FULL access equal to Admin across the whole app — can manage Master Data & Users, view and manage every Task, and assign tasks to anyone except other Admins (can only assign to themselves). Cannot be checked together with "Leader".',
  },
  action_view: { id: 'Lihat', en: 'View' },
  td_assignment_info_title: { id: 'Informasi Penugasan', en: 'Assignment Info' },
  td_assigned_by_label: { id: 'Pemberi Tugas', en: 'Assigned By' },
  td_assigned_to_label: { id: 'Ditugaskan Kepada', en: 'Assigned To' },
  td_view_only_notice: {
    id: 'Anda hanya bisa melihat task ini (view-only) — tidak bisa mengubah informasi atau menjalankan Time Tracking. Anda tetap bisa menambahkan komentar.',
    en: 'You can only view this task (view-only) — you cannot edit its info or run Time Tracking. You can still add comments.',
  },
  // Perbaikan (permintaan user poin 2 & 3): notice baru untuk penerima delegasi — boleh
  // mengerjakan (ubah status/Time Tracking) tapi tidak boleh mengedit informasi task.
  td_operate_only_notice: {
    id: 'Task ini ditugaskan kepada Anda oleh orang lain — Anda bisa mengerjakannya (ubah status & Time Tracking) dan menambahkan komentar, tapi tidak bisa mengubah informasi task (judul, deskripsi, dan field lainnya).',
    en: 'This task was assigned to you by someone else — you can work on it (change status & Time Tracking) and add comments, but you cannot edit the task info (title, description, and other fields).',
  },
} as const;

export type TranslationKey = keyof typeof translations;
