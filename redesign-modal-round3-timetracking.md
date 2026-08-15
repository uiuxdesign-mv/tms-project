# Redesign Modal Detail Task — Round 3: 5 Opsi Penempatan Time Tracking di Layout Total Saran 4

Konteks: Anda sudah memutuskan redesain TOTAL memakai layout Saran 4 (2 kolom — kiri Judul/Deskripsi/Time Tracking/Fields ringkas, kanan Activity dengan filter & collapse). Satu hal yang belum terjawab oleh mockup itu sendiri: mockup menggambarkan Time Tracking sebagai **1 baris ringkas** ("00:00:00 ▶ Mulai"), padahal versi yang berjalan sekarang jauh lebih detail — 3 statistik (Sesi Saat Ini/Waktu Kerja/Waktu Review), tab Sesi Kerja & Sesi Review dengan tabel riwayat lengkap (Mulai/Lanjut, Jeda/Stop/Kembali/Selesai, Durasi, nama pelaku), badge status (Berjalan/Dijeda/dst.), dan tombol "✕ Batalkan Task". Semua detail itu **wajib tetap ada** — pertanyaannya cuma di MANA dan BAGAIMANA cara menampilkannya supaya kolom kiri tetap terasa ringkas seperti mockup.

Lima opsi di bawah ini semuanya menjaga 100% fitur Time Tracking yang ada sekarang — bedanya di mekanisme dan trade-off tampilan.

---

### Opsi 1 — Strip Ringkas + Expand di Tempat (Rekomendasi)

Saat idle/tidak difokuskan, Time Tracking tampil PERSIS seperti mockup: 1 baris ringkas (badge status kecil + timer sesi berjalan + tombol Mulai/Stop). Begitu baris ini diklik (atau ada ikon chevron di ujung kanan), area itu **meluas di tempat** menampilkan seluruh detail: 3 statistik, tab Sesi Kerja/Sesi Review + tabel, dan tombol Batalkan Task — lalu bisa di-collapse lagi kembali ke baris ringkas. Fields di bawahnya otomatis turun/naik mengikuti tinggi area ini (sama seperti accordion).

**Cocok kalau:** prioritas utama adalah kolom kiri terasa ringkas di kondisi normal (task sedang tidak "difokuskan" untuk time tracking), tapi detail lengkap tetap 1 klik saja.
**Referensi:** pola collapsible section ala [Linear issue sidebar](https://linear.app) & accordion "Files changed" di GitHub PR.
**Risiko:** butuh 1 klik ekstra untuk lihat tabel sesi — kalau user sering butuh lihat riwayat sesi tanpa buka-tutup, ini terasa sedikit lebih lambat dibanding sekarang (yang langsung terlihat).

---

### Opsi 2 — Time Tracking Tetap Kartu Utuh, Full-Width di Atas 2 Kolom

Time Tracking dipertahankan PERSIS seperti sekarang (semua detail selalu terlihat, tidak pernah collapse) — hanya posisinya dipindah jadi strip horizontal penuh **di ATAS** pembagian 2 kolom Fields/Activity, bukan lagi menghuni kolom kiri.

**Cocok kalau:** Time Tracking dianggap fitur inti yang harus selalu terlihat detail lengkapnya tanpa interaksi tambahan (zero-risk untuk fitur, karena tidak ada mekanisme baru sama sekali — cuma pindah posisi).
**Risiko:** modal jadi 3 lapisan (strip Time Tracking + 2 kolom di bawahnya) — secara visual paling jauh dari kesan "ringkas" ala mockup ClickUp yang Anda kirim, karena baris "FIELDS" section tetap dimulai jauh dari atas.

---

### Opsi 3 — Time Tracking Utuh di Kolom Kiri, Sebelum Fields (paling minim perubahan)

Time Tracking apa adanya seperti sekarang (semua detail selalu terlihat) ditaruh di bagian atas kolom kiri, sebelum section "FIELDS" — hanya pindah posisi mengikuti kolom kiri yang baru, tanpa dibuat ringkas/strip sama sekali.

**Cocok kalau:** ingin risiko paling kecil dari sisi implementasi (hampir tidak ada perubahan pada komponen Time Tracking itu sendiri, cuma dipindah lokasi).
**Risiko:** kolom kiri kemungkinan tetap terasa panjang meski Fields sudah dibuat ringkas — jadi tujuan "kolom kiri sepadan tinggi dengan kolom kanan" tidak sepenuhnya tercapai.

---

### Opsi 4 — Strip Ringkas + Detail Muncul sebagai Panel Mengambang (Popover)

Baris ringkas SELALU seperti mockup (tidak pernah berubah tinggi, beda dari Opsi 1). Saat diklik ikon "Lihat Detail", detail penuh (3 statistik, tab sesi, tombol Batalkan Task) muncul sebagai **panel mengambang di atas konten lain** (popover/overlay), bukan mendorong Fields turun. Field di bawahnya tidak pernah bergeser posisi.

**Cocok kalau:** stabilitas layout kolom kiri adalah prioritas nomor 1 (Fields harus selalu di posisi yang sama, tidak boleh "meloncat" saat Time Tracking dibuka/tutup).
**Referensi:** pola popover detail ala [Notion inline database card preview](https://notion.so) atau tooltip kaya konten.
**Risiko:** menambah 1 lapisan overlay baru di dalam modal yang sudah berlapis — perlu extra hati-hati soal z-index & klik-di-luar-untuk-tutup supaya tidak terasa "modal di dalam modal".

---

### Opsi 5 — Sub-Tab "Fields" vs "Time Tracking" di Kolom Kiri

Kolom kiri dipecah jadi 2 sub-tab kecil di bagian atas: tab **"Fields"** (default — tampilan ringkas ala mockup) dan tab **"Time Tracking"** (tampilan detail penuh seperti sekarang, termasuk tab Sesi Kerja/Sesi Review yang sudah ada DI DALAM tab ini). User pindah sub-tab untuk melihat salah satu, bukan scroll panjang atau expand/collapse.

**Cocok kalau:** Anda ingin Time Tracking & Fields dianggap dua "mode" yang jarang dilihat bersamaan (mis. saat mengisi Fields task baru vs. saat sedang bekerja & pantau sesi) — makanya dipisah total per tab.
**Risiko:** effort menengah (perlu state tab baru terpisah dari tab Sesi Kerja/Sesi Review yang sudah ada — jadi ada 2 tingkat tab bersarang: sub-tab luar Fields/Time Tracking, lalu di dalam tab Time Tracking masih ada tab Sesi Kerja/Sesi Review lagi). Juga: badge status & timer sesi berjalan jadi TIDAK terlihat sama sekali kalau user sedang di tab "Fields" — perlu indikator kecil tambahan (mis. titik hijau berkedip di label tab "Time Tracking") supaya user tetap tahu ada sesi yang sedang berjalan walau tidak sedang melihat tab-nya.

---

## Ringkasan cepat

| # | Opsi | Kolom kiri tetap ringkas saat idle? | Detail sesi selalu 1x lihat (tanpa klik tambahan)? | Effort | Risiko utama |
|---|------|:---:|:---:|--------|--------------|
| 1 | Strip + expand di tempat | Ya | Tidak (1 klik) | Menengah | Perlu klik ekstra untuk buka detail |
| 2 | Kartu utuh, full-width di atas | Tidak | Ya | Rendah | Paling jauh dari kesan ringkas ala mockup |
| 3 | Kartu utuh, tetap di kolom kiri | Tidak | Ya | Paling rendah | Kolom kiri tetap panjang |
| 4 | Strip + popover mengambang | Ya | Tidak (1 klik) | Menengah–Tinggi | Overlay bersarang, perlu z-index hati-hati |
| 5 | Sub-tab Fields / Time Tracking | Ya | Tidak (ganti tab) | Menengah | Status sesi berjalan bisa "tersembunyi" tanpa indikator tambahan |

**Rekomendasi saya: Opsi 1.** Paling dekat secara visual dengan mockup yang Anda pilih (baris ringkas persis "00:00:00 ▶ Mulai" saat idle), tapi tidak ada satu pun detail yang hilang — semuanya tetap ada, cuma 1 klik untuk membukanya. Risikonya paling kecil dibanding Opsi 4/5 yang menambah lapisan UI baru (popover/sub-tab bersarang), dan lebih ringkas secara visual dibanding Opsi 2/3 yang tidak mengubah apa pun dari tampilan Time Tracking saat ini.

## Sumber

- Mockup referensi yang Anda kirim (Saran 4 — Activity dengan Filter, dari `redesign-modal-mockup-round2.html`).
- [Linear — collapsible sidebar sections](https://linear.app)
- [GitHub — collapsible "Files changed" pattern in Pull Requests](https://docs.github.com/en/pull-requests)
- [Notion — inline preview / popover card pattern](https://notion.so)
