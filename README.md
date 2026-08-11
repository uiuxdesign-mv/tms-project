# TMS — Enterprise Task Management System (Rebuild)

Rebuild aplikasi TMS dari PHP+MySQL ke Next.js + Google Sheets sebagai database, untuk deploy gratis di Vercel.

## Status

### Fase 0 (Fondasi) — selesai
- ✅ Lapisan integrasi Google Sheets API (`src/lib/google/`) — baca/tulis generik ke 10 file spreadsheet, dengan cache 30 detik untuk hemat kuota.
- ✅ Autentikasi: login/logout dengan session JWT (cookie httpOnly), password di-hash dengan bcrypt.
- ✅ Proteksi route otomatis (`src/proxy.ts`) — halaman selain `/login` wajib login. Route `/api/*` menangani auth-nya sendiri (401/403 JSON), tidak ikut di-redirect oleh proxy.
- ✅ Halaman login & dashboard dasar, menampilkan role dan hak "boleh menugaskan ke user lain".

### Fase 1 (Master Data) — selesai
- ✅ Sistem CRUD generik (`src/lib/master-data/`) untuk 7 master data: Roles, Clients, Projects, Priorities, Task Types, Employment Types, Statuses — satu mesin yang sama dipakai semua, tinggal tambah konfigurasi field baru untuk entity baru.
- ✅ Validasi server-side (required, email, angka) + pengecekan referensi sebelum hapus (mis. Client tidak bisa dihapus kalau masih dipakai Project).
- ✅ Halaman Master User terpisah (logika lebih kompleks): pilih Role & Employment Type, field "boleh menugaskan ke user lain" hanya muncul kalau tipe kepegawaian eligible — **dihitung ulang independen di server**, tidak dipercaya mentah-mentah dari request client (sudah diuji: percobaan manipulasi nilai dari client berhasil ditolak/dikoreksi server).
- ✅ Semua endpoint master data hanya bisa diakses role Admin untuk saat ini (aturan sementara — akan diganti sistem permission per-role per-menu di Fase 3).

### Fase 2 (Task Management) — selesai
- ✅ CRUD Task (`/tasks`), terhubung ke Client, Project, Priority, Task Type, dan Status dari Fase 1. Bisa diakses semua role yang sudah login (tidak dibatasi Admin saja, beda dari Master Data).
- ✅ Task Type dengan `requires_related_task = Ya` mewajibkan field "Task Terkait" diisi (mis. tipe "Follow-up") — divalidasi di server.
- ✅ Status dengan `is_final = Ya` otomatis mengisi `completed_at` saat task disimpan/diubah ke status itu.
- ✅ Assignment: `canAssignToOthers()` — Admin selalu boleh menugaskan siapa saja; role lain mengikuti `session.canAssignOthers` (dihitung independen di server saat login, bukan dipercaya dari request). **Sudah diuji**: user tanpa hak ini yang mencoba memanipulasi `assigned_to` lewat request langsung tetap dipaksa server jadi menugaskan ke dirinya sendiri.
- ✅ Visibilitas: Admin melihat semua task; role lain hanya melihat task yang dia buat atau yang ditugaskan ke dia (`src/lib/models/tasks.ts` — `canViewTask`/`canManageTask`). **Sudah diuji** lewat 2 user berbeda: user non-admin tidak bisa melihat, mengubah, atau menghapus task milik user lain (403).
- ✅ Hapus task: hanya Admin atau pembuat task (`assigned_by`) yang boleh.

### Fase 3 (Menu & Access Control) — selesai
- ✅ Sistem hak akses per-role per-menu (`src/lib/menu-access/`), menggantikan aturan sementara "Master Data hanya untuk Admin" di Fase 1/2. Sheet Menu Access (`role_id` + `menu_key` + `can_view/create/edit/delete`) sekarang benar-benar dipakai.
- ✅ Role **Admin selalu punya akses penuh** ke semua menu — dihitung ulang di server (`hasMenuPermission`), tidak pernah dibaca dari sheet Menu Access untuk Admin, jadi tidak mungkin ke-lock keluar oleh matriks yang salah.
- ✅ Role lain (Manager, Member, dst): akses **default ditolak (fail-closed)** untuk setiap menu sampai Admin secara eksplisit mencentang izinnya — jadi migrasi dari `requireAdmin()` ke `requirePermission()` tidak membuka akses baru untuk siapa pun sebelum diatur.
- ✅ Guard baru `requirePermission(menuKey, action)` (`src/lib/auth/require-permission.ts`) menggantikan `requireAdmin()` di **semua** endpoint Master Data (`/api/master/[entity]/...`) dan Users (`/api/users/...`), dengan 4 aksi terpisah: `view` (GET list & options), `create` (POST), `edit` (PATCH), `delete` (DELETE) — jadi bisa saja satu role boleh lihat & tambah Client tapi tidak boleh menghapusnya.
- ✅ Halaman UI Master Data & Users kini menyembunyikan tombol "+ Tambah" / "Edit" / "Hapus" sesuai hak akses masing-masing (bukan cuma diblokir di server) — dicek server-side lewat `hasMenuPermission()` di setiap `page.tsx`, dikirim ke komponen client sebagai prop `permissions`.
- ✅ Halaman baru **Menu & Access Control** (`/master/menu-access`, menu "Administrasi" di dashboard): Admin memilih Role (selain Admin) lalu mencentang matriks Lihat/Tambah/Ubah/Hapus per menu, disimpan lewat `/api/menu-access`. Halaman & API ini **sengaja tetap hardcode admin-only** (pakai `requireAdmin()`, bukan `requirePermission()`) supaya tidak ada risiko "mengunci diri sendiri" — kalau ini juga diatur oleh Menu Access, Admin yang salah konfigurasi bisa kehilangan akses ke halaman yang seharusnya memperbaikinya.
- ✅ Dashboard sekarang menampilkan menu Master Data secara dinamis sesuai hak akses `can_view` role yang login (`getVisibleMenuKeys`), bukan lagi hardcode "hanya tampil untuk Admin".
- ✅ Modul Tasks (Fase 2) **tidak berubah** — tetap bisa diakses semua role yang login, scoping visibilitas per-user tetap sama.
- ✅ **Sudah diuji** lewat skenario end-to-end: user Manager baru (tanpa permission apa pun) ditolak 403 di semua endpoint Master Data & Users; setelah Admin memberi izin Lihat+Tambah+Ubah (tanpa Hapus) untuk menu Clients lewat `/api/menu-access`, user Manager yang sama langsung (tanpa perlu login ulang) bisa melihat & membuat Client tapi tetap ditolak 403 saat mencoba menghapusnya; setelah izin dicabut lagi, akses langsung tertutup kembali di request berikutnya — membuktikan perubahan matriks berlaku real-time (cache 30 detik ikut ter-invalidate saat sheet Menu Access ditulis).

### Fase 4 (Dashboard & Report) — selesai
- ✅ Modul Report baru (`/reports`, menu "Reports" di dashboard) — bisa diakses semua role yang login, **memakai aturan visibilitas yang sama persis dengan Tasks** (Admin lihat semua, role lain hanya task yang dia buat/ditugaskan ke dia). Sengaja tidak diatur lewat Menu Access, konsisten dengan keputusan Fase 3 bahwa Tasks & turunannya tetap terbuka untuk semua user login.
- ✅ Ringkasan (`src/lib/reports/summarize.ts`): Total tugas, jumlah Terlambat (`due_date` sudah lewat & status belum final), jumlah Jatuh Tempo dalam 7 hari, breakdown per Status dan per Prioritas (ditampilkan sebagai bar chart sederhana, dihitung ulang otomatis mengikuti filter yang aktif).
- ✅ Filter di halaman Report: cari judul, Client, Project, Prioritas, Status, Ditugaskan Ke, rentang tanggal jatuh tempo, dan toggle "hanya yang terlambat" — semuanya dihitung di browser (data task di-load sekali dari `/api/reports/tasks`, filter/agregasi tidak perlu roundtrip ke server tiap kali diganti).
- ✅ Export CSV dari hasil yang sedang difilter (tombol "Export CSV"), termasuk kolom status keterlambatan — file CSV pakai BOM UTF-8 supaya nama/karakter Indonesia tampil benar saat dibuka di Excel.
- ✅ Dashboard menampilkan ringkasan singkat (Total, Terlambat, Jatuh Tempo 7 Hari) langsung dari server (tanpa request tambahan dari browser), dengan tautan "Lihat laporan lengkap" ke `/reports`.
- ✅ **Sudah diuji**: dibuat 4 task percobaan (terlambat, jatuh tempo dekat, jauh di masa depan, dan selesai dengan tanggal jatuh tempo yang sudah lewat) — dipastikan task berstatus final TIDAK dihitung sebagai terlambat meski tanggalnya sudah lewat, dan hitungan "Jatuh Tempo 7 Hari" tidak tumpang tindih dengan "Terlambat". Juga diuji dengan user non-admin: setelah salah satu task di-assign ke user tersebut, `/api/reports/tasks` untuk user itu hanya mengembalikan task miliknya (1 dari 4), membuktikan scoping laporan ikut aturan visibilitas Tasks yang sama. Data uji sudah dibersihkan setelahnya.

### Fase 5 (Import/Export CSV Master Data) — selesai
- ✅ Tombol **Export CSV** di semua halaman Master Data generik (Roles, Clients, Projects, Priorities, Task Types, Employment Types, Statuses) — mengekspor data yang sedang tampil di tabel, kolom select (mis. `client_id`) otomatis diubah ke label yang terbaca manusia (mis. nama klien), bukan ID mentah.
- ✅ Tombol **Template CSV** (khusus user yang punya izin Tambah) — download file CSV kosong berisi header kolom yang benar (pakai nama kolom teknis, mis. `client_name`, `status`) supaya gampang diisi di Excel/Google Sheets.
- ✅ Tombol **Import CSV** (khusus user yang punya izin Tambah) — upload file CSV, tiap baris divalidasi & disimpan lewat endpoint create yang sama persis dengan form "+ Tambah" (jadi aturan validasi selalu konsisten, tidak ada logika duplikat). Kolom select menerima **nama/label** (bukan ID), dicocokkan otomatis ke ID yang benar (case-insensitive) — kalau tidak ketemu, baris itu ditandai gagal dengan pesan jelas, baris lain tetap lanjut diproses.
- ✅ Setelah import selesai, muncul ringkasan hasil per baris (berhasil/gagal + alasan), supaya user tahu persis apa yang perlu diperbaiki tanpa harus menebak-nebak.
- ✅ Import dijalankan satu-per-satu (bukan paralel) untuk menghindari limit kuota tulis Google Sheets API (60 write/menit).
- ✅ Sengaja **tidak** mencakup Users (import password massal lewat CSV berisiko keamanan) — Users tetap lewat form manual seperti sebelumnya.
- ✅ **Sudah diuji**: import 4 baris percobaan (2 valid termasuk uji case-insensitive pada kolom status "active" -> "Active", 1 baris dengan field wajib kosong, 1 baris dengan nilai pilihan tidak valid) — hasilnya persis sesuai ekspektasi per baris. Juga diuji round-trip Export -> Import: file hasil export bisa langsung dipakai untuk import ulang tanpa perlu diedit. Parser CSV (`src/lib/csv.ts`) diuji terpisah untuk kasus koma di dalam kutip, newline di dalam field, escape kutip ganda, dan BOM. Data uji sudah dibersihkan.

### Fase 6 (Audit Log) — selesai
- ✅ File Google Sheets ke-11 "Audit Log" (`SHEET_ID_AUDIT_LOG`) — dibuat oleh user di folder "TMS Database" lalu ID-nya diverifikasi lewat Drive API (bukan baca manual dari URL/screenshot, supaya tidak salah transkripsi karakter mirip seperti `I`/`l`/`1` — persis kasus yang pernah terjadi di 10 sheet pertama).
- ✅ `src/lib/models/audit-log.ts` — `logAction()` mencatat 1 baris (pelaku, aksi Tambah/Ubah/Hapus, tipe & nama data, waktu) tiap kali ada perubahan; `getAuditLog()` membaca semuanya untuk halaman Audit Log.
- ✅ Pencatatan **fire-and-forget**: kalau `logAction()` gagal (mis. kuota Google Sheets API habis), operasi utama (simpan/ubah/hapus data user) tetap berhasil — error audit log hanya dicatat di log server, tidak pernah menggagalkan permintaan user. Ini keputusan desain yang disengaja: audit log adalah pelengkap, bukan boleh jadi titik gagal untuk fitur inti.
- ✅ Dicatat otomatis di: semua endpoint create/update/delete Master Data, Users, dan Tasks, plus perubahan matriks Menu Access (siapa mengubah hak akses role apa, kolom apa saja yang diberi akses).
- ✅ Halaman **Audit Log** baru (`/audit-log`, menu "Administrasi" di dashboard) — **admin-only**, sengaja tetap pakai `requireAdmin()` (bukan `requirePermission`), supaya jejak audit tidak bisa diatur hak aksesnya lewat sistem permission yang direkamnya sendiri (pola yang sama dengan halaman Menu Access).
- ✅ Filter: cari nama data, Tipe Data, Aksi, Pelaku, rentang tanggal — plus Export CSV dan tombol "Muat lebih banyak" (data ditampilkan bertahap 100 baris supaya halaman tetap ringan meski log sudah menumpuk banyak, tanpa membatasi jumlah yang benar-benar diambil dari server).
- ✅ **Sudah diuji**: create → update → delete pada 1 data Client menghasilkan 3 baris log berurutan (terbaru di atas) dengan label yang benar (baris delete tetap menampilkan nama sebelum dihapus). Perubahan matriks Menu Access tercatat dengan ringkasan kolom yang diberi akses (mis. `master-clients(L)` untuk izin Lihat saja). User non-admin ditolak 403 saat mengakses `/api/audit-log` langsung. Aksi yang dilakukan user non-admin (setelah diberi izin lewat Menu Access) tercatat dengan nama pelaku yang benar (bukan tercatat sebagai Admin). Data uji dibersihkan seperti biasa — kecuali baris di Audit Log itu sendiri, yang sengaja dibiarkan (memang begitu cara kerja audit log: mencatat semua yang terjadi, termasuk aktivitas pengujian ini).

### Fase 7 (Perbaikan Integritas & Keamanan Data) — selesai

Hasil tindak lanjut dari `AUDIT-KOMPARASI-OLD-vs-NEW.md` (audit perbandingan aplikasi PHP lama vs rebuild ini) — fokus menutup celah integritas data & keamanan sebelum menambah modul besar baru. 4 keputusan desain berikut dikonfirmasi langsung ke stakeholder sebelum implementasi: Master Users dikunci admin-only (ikut aplikasi lama), visibilitas Task dipersempit ke assignee saja (ikut aplikasi lama), CSV Role/Employment Type dipertahankan dengan pengaman tambahan, CSV Master User dibangun baru dengan pengaman setara aplikasi lama.

- ✅ **Role `role_key` dikunci saat edit + proteksi role sistem** — kolom baru `roles.is_system` (Ya untuk admin/manager/member bawaan). `role_key` tidak bisa diganti setelah dibuat (`lockOnEdit`, nilai dari request diabaikan diam-diam, dipaksa balik ke nilai lama), dan role dengan `is_system=Ya` tidak bisa dihapus (409) — mencegah admin salah klik mengunci diri sendiri keluar dari sistem lewat perubahan `role_key` atau penghapusan role inti.
- ✅ **Validasi nama unik** di semua master data (Client, Project, Priority, Task Type, Employment Type, Status, Role) — sebelumnya rebuild ini mengizinkan nama duplikat yang membingungkan user saat memilih dari dropdown; sekarang create/edit dengan nama yang sudah dipakai ditolak (422). `role_key` juga divalidasi pola (huruf kecil/angka/underscore, diawali huruf) supaya konsisten dipakai sebagai kode di seluruh sistem.
- ✅ **Integritas referensial generalisasi + "Reassign & Hapus"** (`src/lib/master-data/references.ts`) — sebelumnya cuma Task Type yang punya proteksi ini di aplikasi lama; sekarang **semua** master data yang dipakai Task (Client, Project, Priority, Task Type, Status) diproteksi: menghapus data yang masih dipakai Task diblokir (409) dengan opsi **pindahkan dulu referensinya ke data lain baru hapus** (`/api/master/[entity]/[id]/reassign-delete`), lewat modal baru di halaman Master Data.
- ✅ **Validasi alur status Task** (`Rule A` & `Rule B`, meniru `Task::moveStatus()` aplikasi lama) — kolom baru `statuses.is_default` (tepat satu status jadi status awal Task baru, ditegakkan otomatis saat set default baru) & `statuses.workflow_level` (urutan tahapan). Saat Task diubah statusnya: **Rule A** — status akhir (`is_final=Ya`) wajib sudah ada assignee-nya; **Rule B** — tidak boleh melompati lebih dari 1 tahap workflow ke depan (mundur bebas, status tanpa `workflow_level` dikecualikan).
- ✅ **Hak akses Tasking & Report kini digerbang Menu Access** — sebelumnya kedua modul ini terbuka untuk siapa pun yang login (beda dari Master Data yang sudah digerbang sejak Fase 3). Sekarang keduanya pakai `requirePermission()` yang sama, dengan aksi baru **Export** (kolom baru `menu_access.can_export`) supaya admin bisa memisahkan siapa boleh lihat vs siapa boleh export data. **Default fail-closed** — sampai admin mengatur matriks Menu Access untuk role Manager/Member, hanya Admin yang bisa akses Tasking & Report (lihat catatan penting di bagian "Yang perlu dilakukan setelah deploy" di bawah).
- ✅ **Proteksi CSRF** (`src/lib/auth/csrf.ts`, `src/proxy.ts`) — pola double-submit cookie: setiap pengunjung (termasuk yang belum login) diberi cookie `tms_csrf`; semua request mengubah data (`POST/PUT/PATCH/DELETE` ke `/api/*`) wajib mengirim header `x-csrf-token` yang cocok dengan cookie tersebut, kalau tidak ditolak 403. Semua pemanggilan `fetch` di sisi client sudah diganti ke wrapper `apiFetch()` (`src/lib/csrf-client.ts`) yang otomatis menyisipkan header ini.
- ✅ **Master Users dikunci admin-only** — sebelumnya bisa didelegasikan lewat Menu Access seperti master data lain; sekarang mengikuti aplikasi lama, dikunci permanen ke `requireAdmin()` di API & halaman, dan **dihapus dari daftar menu yang bisa didelegasikan** di Menu & Access Control.
- ✅ **Visibilitas Task dipersempit** (`src/lib/models/tasks.ts` — `canViewTask`) — sebelumnya user non-manager bisa melihat task yang dia buat **atau** yang ditugaskan ke dia; sekarang mengikuti aplikasi lama: hanya task yang **ditugaskan ke dia** (kecuali Admin & role dengan `canAssignToOthers`, yang tetap melihat semua — setara Manager di aplikasi lama).
- ✅ **Import/Export CSV Master User (baru)** — sebelumnya tidak ada di rebuild ini (beda dari aplikasi lama yang punya fitur ini). Sekarang dibangun dengan pengaman setara aplikasi lama: password **tidak pernah** ada di file CSV — server yang membuat password acak untuk tiap user hasil import, kolom baru `users.must_change_password` dipaksa `Ya`, dan user tersebut **wajib ganti password sendiri** di halaman baru `/change-password` sebelum bisa memakai aplikasi manapun (dipaksa oleh `src/proxy.ts`). Password hasil generate ditampilkan **sekali** di layar admin setelah import selesai, untuk disampaikan manual ke user bersangkutan.
- ✅ **Sudah diuji end-to-end** (`test-fase7.mjs`, dijalankan lewat server dev yang tersambung ke Google Sheets produksi yang sama): CSRF ditolak tanpa token; `role_key` tidak bisa diubah & role sistem tidak bisa dihapus; nama duplikat & pola `role_key` ditolak; integritas referensial memblokir hapus lalu reassign-delete berhasil memindahkan referensi; status default tidak bisa dihapus; Menu Access tetap membolehkan Admin bypass; import User dengan password acak menghasilkan user dengan `must_change_password=Ya`; redirect paksa ke `/change-password` bekerja lalu berhenti otomatis setelah password diganti (sesi JWT diterbitkan ulang tanpa perlu logout manual); Rule B alur status diuji terisolasi (lompat 1 & 2 tahap ditolak, maju 1 tahap & mundur bebas diterima). Rule A diverifikasi lewat code review (skenario "assignee kosong" tidak bisa dicapai lewat API manapun karena Task selalu punya assignee sejak dibuat). Seluruh data uji sudah dibersihkan dari Google Sheets produksi setelah pengujian selesai.

Dengan ini, seluruh rencana awal (Fase 0–6) plus perbaikan Fase 7 sudah selesai dibangun: Fondasi, Master Data, Task Management, Menu & Access Control, Dashboard & Report, Import/Export CSV, Audit Log, dan perbaikan integritas & keamanan data.

### Fase 8 (Kanban, Calendar, Time Tracking, Self-service Profile) — selesai

Tindak lanjut bagian "Fase 8 — Modul Besar yang Hilang" di roadmap audit. 4 sub-modul dikerjakan berurutan atas pilihan Anda: Time Tracking → Kanban → Calendar → Self-service Profile. Reset password lewat email **sengaja di-skip** dulu (butuh keputusan penyedia layanan email terpisah) — ganti password tetap lewat halaman Profile dengan verifikasi password lama, sama seperti aplikasi lama.

- ✅ **Kanban board** (`/tasks/kanban`) — kolom per Status diurutkan `workflow_level`, drag-and-drop kartu Task antar kolom untuk pindah status. Drag **lebih ketat** dari form Edit biasa: cuma boleh geser task persis 1 tahap maju (flag `viaKanbanDrag` diperiksa server di `PATCH /api/tasks/[id]`); untuk pindah mundur, tetap pakai halaman List yang aturannya Rule B standar (mundur bebas, dari Fase 7). Kartu menampilkan Client/Project, Priority, Assignee, indikator merah untuk Due Date yang sudah lewat, dan widget Time Tracking mini yang sama dengan tabel List.
- ✅ **Calendar view** (`/tasks/calendar`) — grid bulanan berdasarkan `due_date` Task, navigasi bulan maju/mundur, dan daftar terpisah **"Unscheduled"** untuk Task tanpa Due Date. Klik Task menampilkan detail ringkas (read-only) dengan tautan ke List untuk mengubahnya.
- ✅ **Time Tracking** (`src/lib/models/time-tracking.ts`) — model **append-only event log** di sheet baru `task_time_logs` (`task_id`, `user_id`, `session_no`, `action` start/pause/resume/stop, `is_review`, `occurred_at`); state (idle/running/paused) dan durasi **di-derive dari replay event**, bukan disimpan sebagai kolom terpisah — mengikuti spesifikasi aplikasi lama persis. Beda dari aplikasi lama yang workflow-nya selalu tepat 4 tahap tetap (level hardcode), rebuild ini **generik mengikuti konfigurasi Status** (`is_default`/`is_review`/`is_final` + `workflow_level`, sama filosofinya dengan validasi workflow Fase 7):
  - **Start** di status default → otomatis maju 1 tahap (`workflow_level+1`).
  - **Stop** di status "in-progress" (bukan default/review/final) → otomatis maju ke status yang ditandai `is_review=Ya` (kolom baru `statuses.is_review`, kalau dikonfigurasi admin) **+ otomatis membuka sesi review baru**.
  - **Back** (keluar review ke belakang) & **Done** (keluar review ke status final) sama-sama otomatis menutup sesi review yang berjalan.
  - Kalau admin tidak mengonfigurasi status manapun sebagai `is_review=Ya`, alur tetap jalan tanpa tahap review terpisah (Stop cukup menutup sesi).
  - Kolom baru `tasks.actual_duration_seconds` jadi cache akumulasi durasi (diperbarui tiap event pause/stop) supaya daftar Task/Kanban tidak perlu replay penuh hanya untuk tampil; badge durasi **live-ticking** dihitung di client tanpa polling.
  - Endpoint: `GET/POST /api/tasks/[id]/time-tracking` (aksi `start`/`pause`/`resume`/`stop`/`back`/`done`, semuanya validasi no-op server-side — aksi yang tidak sesuai state saat ini ditolak 422, bukan diam-diam diabaikan). Digerbang `requirePermission('tasking','edit')` + hak kelola Task yang sama seperti PATCH biasa (assignee sendiri atau Manager/Admin).
  - **Sudah diuji end-to-end** (42 pemeriksaan) terhadap workflow 4-tahap (Default → In-Progress → Review → Final): no-op ditolak saat idle/running/paused sesuai state, auto-advance status di setiap transisi, akumulasi durasi lintas beberapa sesi, dan Task yang sudah final ditolak semua aksi Time Tracking.
  - **Catatan penting untuk data existing**: sheet produksi saat ini cuma punya 2 Status (Open/Done) — cukup untuk Start/Stop dasar, tapi tanpa tahap Review terpisah (karena tidak ada status dengan `is_review=Ya`) sampai Anda menambah status di antaranya lewat Master Status.
  - **Degradasi aman**: kalau sheet `task_time_logs` belum ada/tidak terkonfigurasi, daftar Task/Kanban/Calendar tetap jalan normal (fallback ke state "idle" untuk semua Task) — tidak ikut error 500, cuma Time Tracking-nya belum aktif.
- ✅ **Self-service Profile** (`/profile`, `src/app/api/profile/route.ts`) — user mengubah nama/email/telepon/departemen sendiri (kolom baru `users.phone` & `users.department`), plus ganti password sendiri (`/api/auth/change-password`, wajib tahu password lama — endpoint ini sudah ada sejak Fase 7 untuk alur paksa-ganti-password, sekarang dipakai juga di sini). Perubahan nama/email langsung diterbitkan ulang ke sesi JWT (tidak perlu logout/login manual). Admin juga bisa mengisi telepon/departemen dari Master Users. **Sengaja tidak termasuk** upload foto profil (alasan arsitektural — Google Sheets/serverless tanpa persistent blob storage, dicatat di audit sebagai gap yang sah) dan Forgot/Reset Password lewat email (butuh keputusan layanan email terpisah).

### Fase 9 (Comments + Lampiran) — selesai

Tindak lanjut bagian "Fase 9 — Comments (dengan lampiran file)" di roadmap audit. Keputusan penyimpanan lampiran dikonfirmasi langsung ke stakeholder sebelum implementasi: **tetap pakai Google Drive** (bukan Vercel Blob/GCS), lewat **OAuth2 ke akun Google pribadi** (bukan service account — service account yang dipakai untuk Sheets terbukti tidak punya kuota storage Drive, sama seperti temuan Fase 6 & 8).

- ✅ **Sheet baru `task_comments`** (`src/lib/google/spreadsheet-ids.ts` — `SHEET_ID_TASK_COMMENTS`) — 1 baris per komentar: `id`, `task_id`, `user_id`, `comment`, `attachment_drive_file_id`, `attachment_category`, `attachment_mime_type`, `attachment_original_name`, `attachment_file_size`, `created_at`, `updated_at`, `deleted_at` (soft-delete, konsisten dengan tabel lain).
- ✅ **OAuth2 Google Drive** (`src/lib/google/drive-oauth.ts`) — beda dari koneksi Sheets (service account, Fase 0), lampiran pakai `google.auth.OAuth2` yang diotorisasi manual sekali oleh Admin ke akun Google **pribadi** Admin (scope `drive.file` — aplikasi hanya bisa mengakses file yang **dibuatnya sendiri**, tidak bisa melihat/mengubah file lain di Drive Admin). Alur satu kali:
  1. Admin login ke aplikasi, buka `/api/auth/google-drive/connect` (admin-only) → diarahkan ke halaman consent Google.
  2. Karena app belum diverifikasi Google (status "Testing" di OAuth Consent Screen), akan muncul peringatan "Google hasn't verified this app" — klik **Advanced/Continue** → **Allow**. Ini normal untuk app buatan sendiri, bukan tanda bahaya.
  3. Google redirect ke `/api/auth/google-drive/callback`, yang menukar `code` menjadi `refresh_token`, otomatis membuat folder "TMS Comment Attachments" di Drive Admin, lalu menampilkan **2 nilai** untuk disalin manual ke environment variable: `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` dan `GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID`.
  4. Refresh token ini **statis** (tidak expired kecuali di-revoke manual dari Google Account atau tidak dipakai 6 bulan) — server memakainya untuk minta access token baru tiap kali ada upload/download, tidak perlu login ulang.
- ✅ **Magic-byte MIME sniffing** (`src/lib/mime-sniff.ts`) — tipe file divalidasi dari **isi file** (signature/magic bytes), bukan dari `Content-Type` header atau ekstensi nama file yang dikirim browser (keduanya bisa dipalsukan client). Kategori: image (maks 5MB), video (maks 25MB), file dokumen/pdf/teks (maks 10MB) — kategori & limit di `SIZE_LIMITS_BYTES`.
- ✅ **Proxy download, bukan link Drive langsung** — lampiran **tidak pernah** dibagikan lewat link publik/shareable Drive. Satu-satunya jalan mengunduh adalah `/api/tasks/[id]/comments/[commentId]/attachment`, yang mengecek ulang hak visibilitas Task (sama seperti mengedit Task) sebelum men-stream isi file dari Drive — jadi aturan "siapa boleh lihat Task ini" otomatis berlaku juga untuk lampirannya.
- ✅ **Otorisasi komentar** (`src/lib/models/comments.ts`, sesuai spesifikasi audit): **Tambah** komentar butuh izin `edit` pada menu Tasking **dan** hak kelola Task yang sama seperti mengedit Task (`canManageTask` — Member cuma boleh komentar di Task miliknya). **Edit** teks komentar **hanya penulis sendiri**, tanpa pengecualian role apa pun — Admin sekalipun tidak bisa mengedit komentar user lain (meniru persis aplikasi lama). **Hapus** boleh oleh penulis sendiri, ATAU siapa pun dengan izin `delete` pada Tasking.
- ✅ **Hapus komentar ikut membersihkan Drive** — soft-delete baris di sheet, sekaligus file lampiran di Drive dihapus permanen (best-effort), supaya tidak menumpuk file yatim selamanya di Drive pribadi Admin untuk komentar yang sudah dihapus.
- ✅ **Degradasi aman** (pola sama seperti Time Tracking Fase 8) — kalau sheet `task_comments` atau OAuth Drive belum dikonfigurasi, endpoint Comments & feed Dashboard menampilkan pesan 503 yang jelas ("belum dikonfigurasi, hubungi admin") alih-alih 500 mentah; komentar teks-saja (tanpa lampiran) tetap bisa jalan meski Drive belum tersambung.
- ✅ Widget **Komentar** ditambahkan di modal Edit Task (`src/components/task-comments.tsx`) — daftar komentar urut lama→baru, form kirim komentar (teks + opsional 1 lampiran), tombol Edit (kalau penulis) & Hapus (kalau penulis atau berhak).
- ✅ Dashboard menampilkan feed **"Komentar Terbaru"** (5 komentar terakhir dari Task yang visible ke sesi yang login), dibungkus try/catch untuk degradasi aman yang sama.
- ✅ **Sudah diuji end-to-end di production** (`tms-project-topaz.vercel.app`), memakai kredensial OAuth Drive asli: upload komentar + lampiran gambar → berhasil tersimpan sungguhan di folder "TMS Comment Attachments" milik Admin; list komentar menampilkan metadata lampiran yang benar; download lewat endpoint proxy menghasilkan byte yang identik dengan file asli; hapus komentar berhasil membersihkan baris sheet **dan** file di Drive (diverifikasi folder kosong kembali setelahnya lewat Drive API). Seluruh data uji sudah dibersihkan, tidak ada sisa di sheet maupun Drive.

## Yang perlu dilakukan setelah deploy Fase 9 (setup OAuth Drive — sekali saja)

Berbeda dari koneksi Google Sheets (service account, otomatis), koneksi Google Drive untuk lampiran **wajib diotorisasi manual sekali oleh Admin** setelah setiap deploy pertama ke project Vercel baru (atau kalau refresh token pernah di-revoke). Langkah lengkap:

1. **Buat OAuth Client ID** di [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (project yang sama dengan service account Sheets, atau project baru) → APIs & Services → Credentials → Create OAuth Client ID → tipe **Web application**.
   - Authorized redirect URI: `https://<domain-production-Anda>/api/auth/google-drive/callback` (pakai domain stabil/production, **jangan** domain preview per-deployment).
   - Pastikan **Google Drive API** sudah di-enable di project tersebut.
   - Di OAuth Consent Screen, tambahkan akun Google yang akan dipakai sebagai Test User (kalau app masih status "Testing").
2. Tambahkan 3 environment variable dasar di Vercel (Project Settings → Environment Variables), lalu redeploy:
   - `GOOGLE_DRIVE_OAUTH_CLIENT_ID`
   - `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` — **wajib diisi eksplisit** dengan domain production yang stabil (jangan andalkan fallback otomatis ke `VERCEL_URL`, karena itu resolve ke domain unik per-deployment dan akan menyebabkan error `redirect_uri_mismatch` di Google).
   - Tambahkan juga `SHEET_ID_TASK_COMMENTS` (ID sheet "Task Comments" — dibuat manual oleh Anda di folder Drive "TMS Database", sama seperti sheet Audit Log/Task Time Log di fase-fase sebelumnya, karena service account tidak punya kuota storage untuk membuat file sendiri).
3. Login ke aplikasi sebagai Admin, buka `https://<domain-production-Anda>/api/auth/google-drive/connect`, selesaikan consent flow (lihat langkah di bagian Fase 9 di atas).
4. Salin **2 nilai** yang ditampilkan halaman callback ke environment variable Vercel, lalu **redeploy sekali lagi**:
   - `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID`
5. **Kalau punya lebih dari satu project Vercel yang ter-deploy dari repo GitHub yang sama** (bisa terjadi tanpa disadari kalau repo pernah di-import ke Vercel lebih dari sekali) — pastikan environment variable di atas ditambahkan ke project yang domainnya benar-benar dipakai (cek Vercel → project → Settings → Domains), bukan project duplikat yang tidak dipakai. Ini pernah jadi sumber kebingungan "kenapa env var belum diset padahal sudah ditambahkan" saat setup Fase 9 di project ini.

## Yang perlu dilakukan setelah deploy Fase 7 + Fase 8

1. **Schema Google Sheets produksi sudah dimigrasi otomatis** oleh proses pengembangan ini — kolom baru Fase 7 (`roles.is_system`, `statuses.is_default`, `statuses.workflow_level`, `menu_access.can_export`, `users.must_change_password`) dan Fase 8 (`statuses.is_review`, `tasks.actual_duration_seconds`, `users.phone`, `users.department`) sudah ditambahkan & diisi nilai default yang wajar. **Tidak perlu edit manual di sheet-sheet yang sudah ada.**
2. **Sheet baru `task_time_logs`**: dibuat manual oleh Anda di folder Google Drive "TMS Database" (service account tidak punya kuota storage untuk membuat file sendiri — sama seperti sheet Audit Log di Fase 6), lalu header kolom & ID-nya sudah diisi/diverifikasi otomatis lewat Drive API. **Wajib tambahkan environment variable baru `SHEET_ID_TASK_TIME_LOGS`** di Vercel (Project Settings → Environment Variables) dengan ID sheet tersebut — cek `.env.local` untuk nilai yang dipakai saat development, atau buka sheet "Task Time Log" di folder TMS Database dan salin ID dari URL-nya.
3. **Wajib**: buka **Menu & Access Control** dan atur izin **Tasking** & **Report** untuk role Manager/Member — modul ini fail-closed sejak Fase 7 (belum ada baris izin = ditolak), jadi sampai diatur, **hanya Admin** yang bisa mengakses Tasking (List/Kanban/Calendar/Time Tracking) & Report.
4. Untuk Time Tracking dengan tahap Review terpisah (Start→In-Progress→Review→Done, bukan cuma Start→Stop dua tahap), tambah status baru di **Master Status** dengan `workflow_level` berurutan dan tandai satu status sebagai `is_review=Ya` — tanpa ini, Stop cukup menutup sesi tanpa pindah ke tahap Review.
5. Perilaku yang berubah untuk user (uji ulang di production setelah deploy): Master Users tidak lagi bisa didelegasikan ke role lain lewat Menu Access; user non-manager hanya melihat task yang ditugaskan ke dirinya; drag Kanban lebih ketat dari form Edit (cuma maju 1 tahap, mundur harus lewat List).
6. Environment variable baru yang perlu ditambahkan di Vercel: **hanya `SHEET_ID_TASK_TIME_LOGS`** (poin 2 di atas) — sisanya memakai kolom sheet baru (sudah dimigrasi) dan variable yang sudah ada.

## Menjalankan secara lokal

1. Install dependencies:
   ```
   npm install
   ```
2. Salin `.env.example` menjadi `.env.local`, lalu isi:
   - `GOOGLE_SERVICE_ACCOUNT_KEY` — isi file JSON service account, dalam satu baris.
   - `SHEET_ID_*` — ID dari tiap file Google Sheets (lihat URL spreadsheet masing-masing, bagian antara `/d/` dan `/edit`).
   - `SESSION_SECRET` — string acak panjang (bisa generate dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
3. Jalankan:
   ```
   npm run dev
   ```
4. Buka http://localhost:3000 — akan redirect ke `/login`.

## Deploy ke Vercel

1. Hubungkan repo GitHub ini ke Vercel (Import Project).
2. Di **Project Settings > Environment Variables**, tambahkan semua variable yang sama seperti `.env.local` di atas (untuk environment Production, Preview, dan Development).
3. Deploy. Vercel otomatis build & jalankan `next build`.

**Jangan pernah commit file JSON service account atau `.env.local` ke git** — keduanya sudah masuk `.gitignore`.

## Struktur data (Google Sheets)

Lihat dokumen skema master data yang sudah dikirim terpisah untuk detail kolom tiap tabel. Ringkasnya:

| Tabel | Isi |
|---|---|
| Users | Data user & login |
| Roles | Admin / Manager / Member / dst |
| Clients | Master klien |
| Projects | Master proyek |
| Priorities | Master prioritas tugas |
| Task Types | Master tipe tugas |
| Employment Types | Master tipe kepegawaian (dengan hak "boleh menugaskan ke user lain") |
| Statuses | Master status tugas |
| Menu Access | Hak akses menu per role |
| Tasks | Data tugas (transaksi utama) |
| Audit Log | Jejak aksi Tambah/Ubah/Hapus di semua modul (Fase 6) |
| Task Time Log | Event log Time Tracking (start/pause/resume/stop) per Task (Fase 8) |
| Task Comments | Komentar & lampiran per Task (Fase 9) — file lampiran sendiri disimpan di Google Drive (folder terpisah "TMS Comment Attachments"), sheet ini hanya menyimpan teks komentar + referensi ke file Drive |

Setiap tabel = 1 file spreadsheet terpisah, semua berada di folder Google Drive "TMS Database" yang di-share ke service account.

## Arsitektur singkat

- `src/lib/google/client.ts` — koneksi Google Sheets API pakai service account.
- `src/lib/google/sheet-table.ts` — CRUD generik (getAll, findById, insertRow, updateRow, softDeleteRow) yang dipakai semua modul, dengan cache in-memory 30 detik untuk mengurangi panggilan API.
- `src/lib/models/` — logika spesifik per entitas (mis. `users.ts` untuk hashing/verifikasi password).
- `src/lib/auth/` — session JWT (pakai `jose`, kompatibel dengan Edge runtime, sekarang menyimpan juga `roleId`) + guard untuk API route: `requireAuth()` (siapa saja yang login, dipakai Tasks), `requirePermission(menuKey, action)` (dipakai Master Data & Users, Fase 3), `requireAdmin()` (masih dipakai khusus untuk halaman/API Menu Access itu sendiri).
- `src/lib/menu-access/` — `config.ts` (daftar `MENU_KEYS` yang diatur haknya) dan `permissions.ts` (`hasMenuPermission`, `getVisibleMenuKeys`, baca/simpan matriks ke sheet Menu Access).
- `src/lib/reports/` — `types.ts` (tipe murni) dan `summarize.ts` (fungsi murni hitung ringkasan) untuk modul Report; sengaja dipisah dari `src/lib/models/reports.ts` (yang mengakses Google Sheets) supaya aman diimpor dari komponen client tanpa ikut membawa `googleapis` ke bundle browser.
- `src/proxy.ts` — proteksi route halaman (bukan API) secara otomatis. Next.js 16 mengganti nama konvensi `middleware.ts` menjadi `proxy.ts` — proyek ini sudah pakai yang baru.
- `src/lib/master-data/config.ts` — "kamus" field tiap master data (label, tipe input, relasi ke sheet lain). Menambah entity master data baru cukup menambah 1 entry di sini + halaman generik otomatis mengikuti.
- `src/lib/models/time-tracking.ts` (Fase 8) — model event-log Time Tracking: `deriveState()` (replay event → state idle/running/paused + durasi), `runTimeAction()` (jalankan 1 aksi dengan validasi no-op + auto status-change), `getTimeStatesForTasks()` (versi batch untuk daftar Task/Kanban, 1x baca sheet untuk semua task).
- `src/components/time-tracking-controls.tsx` — widget Start/Pause/Stop/Back/Done + badge live-ticking, dipakai bersama oleh tabel Task List dan papan Kanban.
- `src/components/kanban-board.tsx`, `src/components/calendar-view.tsx`, `src/components/profile-view.tsx` (Fase 8) — komponen client untuk papan Kanban, Calendar, dan Self-service Profile.
- `src/lib/master-data/validate.ts` — validasi generik dari config di atas.
- `src/lib/master-data/references.ts` — pengecekan "masih dipakai data lain atau tidak" sebelum sebuah master data dihapus.
- `src/lib/google/drive-oauth.ts` (Fase 9) — koneksi OAuth2 ke Google Drive **pribadi Admin** (terpisah dari service account Sheets): `getConsentUrl()`/`exchangeCodeForTokens()` untuk alur otorisasi sekali, `uploadAttachment()`/`downloadAttachment()`/`deleteAttachment()` untuk operasi file sehari-hari, `findOrCreateAttachmentsFolder()` untuk folder tujuan upload.
- `src/lib/mime-sniff.ts` (Fase 9) — deteksi tipe file dari magic bytes (bukan percaya `Content-Type`/nama file dari client), dipakai untuk validasi lampiran komentar.
- `src/lib/models/comments.ts` (Fase 9) — logika Comments: otorisasi tambah/edit/hapus, CRUD ke sheet `task_comments`, orkestrasi upload/hapus file ke Drive.
- `src/components/task-comments.tsx` (Fase 9) — widget Komentar di modal Edit Task.

Karena Google Sheets tidak punya foreign key/transaction seperti MySQL, semua validasi relasi antar tabel (mis. `role_id` di Users harus ada di Roles) ditangani di kode aplikasi, bukan di level database.

## User admin awal (hasil seed)

Email: `admin@tms.local`
Password: `Admin123!` (segera ganti setelah login pertama)

Untuk seed ulang di environment lain, jalankan `node scripts/seed-initial.mjs` (butuh `.env.local` sudah terisi).
