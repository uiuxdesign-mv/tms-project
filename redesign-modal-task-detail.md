# Redesign Modal Detail Task — Analisis & 5 Konsep Alternatif

## 1. Masalah yang ditemukan di desain saat ini

Dari screenshot modal "Tugas Azmy 1" yang dikirim, ini masalah UI/UX konkret yang terlihat:

1. **Kolom kiri (Time Tracking) menyisakan ruang kosong besar.** Widget Time Tracking punya tinggi tetap mengikuti tinggi seluruh modal (karena layout 2 kolom), padahal kontennya (tombol Mulai/Stop, tab Sesi Kerja/Sesi Review) jauh lebih pendek dari itu — begitu di-scroll ke bawah, separuh layar kiri jadi kosong putih polos sementara kolom kanan masih panjang berisi Komentar & Riwayat Perubahan.
2. **Scroll sangat panjang & padat.** Semua informasi (Judul, Deskripsi, Proyek, Klien, Prioritas, Tipe, Assignee, tanggal, estimasi jam, Komentar, Riwayat Perubahan) ditumpuk dalam satu scroll panjang tanpa pengelompokan visual atau kemungkinan "lompat ke bagian tertentu".
3. **Komentar dan Riwayat Perubahan terpisah jadi 2 blok statis**, padahal keduanya sama-sama "apa yang terjadi pada task ini" — pengguna harus scroll dua kali untuk memahami kronologi lengkap.
4. **Aksi destruktif ("Batalkan Task") menempel di widget Time Tracking**, posisinya kurang intuitif — biasanya aksi berbahaya seperti ini dipisah jelas (menu titik tiga, atau area khusus) supaya tidak tertekan tidak sengaja.
5. **Input tanggal memakai native browser date picker** (terlihat dari format "15/08/2026 01.12" dan ikon kalender bawaan) — tampilannya tidak konsisten dengan sisa UI aplikasi.
6. **Tidak ada cara cepat pindah ke task lain** — kalau user habis meninjau satu task dan mau lanjut ke task berikutnya di daftar, harus tutup modal dulu.
7. Modal berbentuk **dialog di tengah layar (menutup total konteks daftar task di belakangnya)** — user kehilangan "peta lokasi" (task ini ada di posisi mana di daftar/kanban).

## 2. Lima konsep redesign

Setiap konsep di bawah punya arah yang genuinely berbeda (bukan cuma variasi kecil), supaya bisa dipilih sesuai prioritas & effort implementasi yang diinginkan. Referensi diambil dari pola nyata yang dipakai aplikasi task management populer.

---

### Konsep 1 — Sidebar Properti Ringkas (ala Linear)

**Ide inti:** Balik struktur 2 kolom. Kolom kiri BUKAN lagi widget Time Tracking full-height, melainkan sidebar ramping berisi daftar properti task (Assignee, Klien, Proyek, Prioritas, Tipe, Tanggal Mulai/Jatuh Tempo, Estimasi Jam) sebagai baris ikon + label yang ringkas — mirip panel properti Issue di Linear. Time Tracking jadi kartu kecil yang collapsible di bagian atas sidebar ini, bukan mendominasi seluruh kolom. Kolom kanan (utama) hanya berisi Judul, Deskripsi, dan Activity feed (lihat Konsep 4).

**Kenapa efektif:** Menghilangkan ruang kosong besar karena sidebar sekarang benar-benar sepanjang isinya, bukan dipaksa setinggi modal. Properti jadi gampang di-scan sekali lihat tanpa scroll, karena ikon + label lebih ringkas dari input field penuh.

**Referensi:** [How we redesigned the Linear UI (part Ⅱ)](https://linear.app/now/how-we-redesigned-the-linear-ui) — Linear memindahkan semua metadata issue ke sidebar kanan berupa baris properti ringkas, memisahkannya dari konten utama (judul, deskripsi, komentar).

**Trade-off:** Field yang tadinya besar (dropdown Proyek, Klien, dst.) perlu didesain ulang jadi versi ringkas/inline-edit (klik untuk edit di tempat), effort implementasi menengah-tinggi karena mengubah pola form.

---

### Konsep 2 — Tab Navigasi (ala item card monday.com)

**Ide inti:** Hilangkan pembagian kolom kiri-kanan sama sekali. Satu kolom penuh, dengan tab horizontal di bagian atas: **Detail | Time Tracking | Komentar | Riwayat**. Tab "Detail" (default aktif) berisi Judul, Deskripsi, dan seluruh field properti. Time Tracking, Komentar, dan Riwayat masing-masing jadi tab terpisah yang baru dimuat/ditampilkan saat diklik.

**Kenapa efektif:** Scroll per tab jadi jauh lebih pendek karena kontennya dipecah, bukan ditumpuk semua. User yang cuma mau isi field task tidak perlu "menyaring" widget Time Tracking/Komentar yang mungkin tidak relevan buat mereka saat itu.

**Referensi:** [The Item Card — monday.com Support](https://support.monday.com/hc/en-us/articles/360017143959-The-Item-Card) — item card monday.com memakai tab (Updates, Files, dsb.) persis untuk memisahkan jenis konten dalam satu item.

**Trade-off:** History (Riwayat) & Komentar jadi "tersembunyi" di balik tab — kalau user sering butuh cek keduanya bersamaan, harus bolak-balik klik tab. Perlu indikator badge count di tab (mis. "Komentar (3)") supaya user tahu ada aktivitas tanpa harus buka tab-nya.

---

### Konsep 3 — Panel Geser dari Kanan, Bukan Modal Tengah (ala Notion Side Peek)

**Ide inti:** Task Detail tidak lagi jadi dialog yang menutupi seluruh layar, melainkan panel yang **slide-in dari sisi kanan** (lebar ~45–55% layar), dengan daftar Task/Kanban di belakangnya tetap terlihat (agak digelapkan). Ditambahkan tombol panah "◀ ▶" di header panel untuk pindah ke task sebelumnya/berikutnya tanpa perlu menutup panel dulu.

**Kenapa efektif:** User tidak kehilangan konteks "sedang di posisi mana" dalam daftar/kanban, dan meninjau banyak task berurutan (misalnya saat review harian) jadi jauh lebih cepat — tidak perlu tutup-buka modal berulang kali.

**Referensi:** [Notion Side Peek release notes](https://www.notion.com/releases/2022-07-20) dan [perbandingan UX full page vs side sheet](https://deveshshirsath.substack.com/p/ux-comparison-full-page-vs-side-sheet) — pola "side peek"/side sheet dipakai luas di Notion, Linear, dan Height justru untuk kasus ini: meninjau detail tanpa kehilangan daftar induk.

**Trade-off:** Effort implementasi paling tinggi di antara kelima opsi — perlu perubahan arsitektur navigasi (bukan cuma ubah tata letak dalam modal, tapi cara modal dipanggil & ditutup), dan perlu logika "next/prev" yang tahu urutan task di view mana pun (List/Kanban/Calendar) sedang aktif.

---

### Konsep 4 — Activity Feed Terpadu (gabung Komentar + Riwayat, ala Jira/GitHub Issues)

**Ide inti:** Gabungkan "Komentar" dan "Riwayat Perubahan" jadi **satu feed kronologis** (terbaru di atas atau di bawah, konsisten dengan pola chat), di mana komentar user dan event sistem (status berubah, ditugaskan ulang, tanggal diubah) tampil berurutan sesuai waktu kejadian, masing-masing dengan avatar/nama aktor + timestamp. Event sistem ditampilkan ringkas (mis. "Nendy mengubah Status dari To Do → In Progress · 2 jam lalu"), komentar ditampilkan penuh dengan lampiran.

**Kenapa efektif:** Saat ini user harus scroll ke 2 tempat terpisah untuk memahami "apa yang sudah terjadi pada task ini" — digabung jadi satu cerita utuh yang jauh lebih mudah diikuti, dan menghemat ruang (tidak ada 2 heading "Komentar (0)" / "Riwayat Perubahan (0)" terpisah).

**Referensi:** [Issue view design guidelines — Atlassian](https://developer.atlassian.com/cloud/jira/platform/issue-view/) dan diskusi [Activity Stream di komunitas Atlassian](https://community.atlassian.com/forums/App-Central-articles/3-ways-to-see-user-activity-in-Jira/ba-p/2234133) — Jira & GitHub Issues sama-sama memakai activity feed terpadu sebagai standar de-facto untuk detail issue/task.

**Trade-off:** Perlu kerja backend tambahan (menyatukan dua sumber data — tabel komentar & tabel riwayat — jadi satu feed terurut waktu), tapi TIDAK mengubah tata letak modal secara keseluruhan, jadi bisa "ditumpuk" di atas konsep 1, 2, atau 5.

---

### Konsep 5 — Accordion Section, Satu Kolom (implementasi paling ringan)

**Ide inti:** Tetap satu kolom (tidak ada perubahan navigasi/arsitektur), tapi konten dikelompokkan jadi bagian yang bisa dibuka-tutup (accordion): **Informasi Utama** (terbuka default), **Time Tracking**, **Komentar**, **Riwayat Perubahan** (tertutup default, tinggal klik untuk expand). Setiap header section menampilkan ringkasan kecil saat tertutup (mis. "Time Tracking · Belum dimulai", "Komentar · 3").

**Kenapa efektif:** Langsung menghilangkan ruang kosong besar (tidak ada lagi kolom kiri yang dipaksa setinggi modal) DAN memperpendek scroll, tanpa perlu mengubah cara modal dipanggil/ditutup atau menambah state navigasi baru — risiko & effort implementasi paling rendah di antara kelima opsi, cocok kalau ingin perbaikan cepat dulu sebelum eksperimen yang lebih besar (Konsep 1/2/3).

**Referensi:** Prinsip *progressive disclosure* dari artikel praktik modal UX — [Modal UX: Best Practices, Mistakes, and When to Use Them](https://glow.team/blog/modal-ux) dan [When Should You Use a Modal? UX Rules and Alternatives](https://userpilot.com/blog/modal-ux-design/) — keduanya menekankan memecah konten modal padat jadi bagian yang bisa disembunyikan/ditampilkan sesuai kebutuhan, bukan menumpuk semua sekaligus.

**Trade-off:** Tidak seelegan/se-modern Konsep 1–3 secara visual, dan kalau user sering butuh lihat banyak section sekaligus (mis. Time Tracking + Komentar bersamaan), harus expand manual satu-satu.

---

## 3. Ringkasan cepat

| # | Konsep | Effort | Dampak visual | Cocok kalau... |
|---|--------|--------|----------------|-----------------|
| 1 | Sidebar Properti Ringkas | Menengah–Tinggi | Tinggi | Ingin tampilan modern ala Linear, siap redesain field jadi inline-edit |
| 2 | Tab Navigasi | Menengah | Tinggi | Ingin pemisahan konten jelas, tidak masalah klik tab |
| 3 | Panel Geser dari Kanan | Tinggi | Sangat tinggi | Sering review banyak task berurutan, siap investasi effort besar |
| 4 | Activity Feed Terpadu | Menengah (backend) | Menengah | Ingin histori & komentar jadi satu cerita, bisa digabung dgn konsep lain |
| 5 | Accordion Section | Rendah | Menengah | Ingin perbaikan cepat & aman dulu, minim risiko ke layout/navigasi |

Catatan: Konsep 4 (Activity Feed Terpadu) sifatnya independen dan bisa **digabung** dengan konsep manapun (1, 2, 3, atau 5) — bukan pilihan yang saling eksklusif terhadap tata letak keseluruhan.

## Sumber

- [How we redesigned the Linear UI (part Ⅱ) — Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [The Item Card — monday.com Support](https://support.monday.com/hc/en-us/articles/360017143959-The-Item-Card)
- [Reorder Item Card Tabs — monday Community Forum](https://community.monday.com/t/reorder-item-card-tabs/35428)
- [Notion Side Peek release notes (July 20, 2022)](https://www.notion.com/releases/2022-07-20)
- [UX comparison: full page vs side sheet](https://deveshshirsath.substack.com/p/ux-comparison-full-page-vs-side-sheet)
- [Issue view design guidelines — Atlassian Developer](https://developer.atlassian.com/cloud/jira/platform/issue-view/)
- [3 ways to see user activity in Jira — Atlassian Community](https://community.atlassian.com/forums/App-Central-articles/3-ways-to-see-user-activity-in-Jira/ba-p/2234133)
- [Modal UX: Best Practices, Mistakes, and When to Use Them — Glow Team](https://glow.team/blog/modal-ux)
- [When Should You Use a Modal? UX Rules and Alternatives — Userpilot](https://userpilot.com/blog/modal-ux-design/)
