# Redesign Modal Detail Task — Round 2: 5 Variasi Berbasis Referensi ClickUp

Referensi yang dikirim (screenshot task detail ClickUp, dark mode) menunjukkan pola: **2 kolom independen** — kiri berisi judul/deskripsi/section "Fields" (tabel properti ringkas, field kosong otomatis disembunyikan) + tautan aksi cepat (Add subtask, dsb.), kanan berisi panel **Activity** persisten (riwayat + komentar tergabung, filter, search) dengan kotak komentar yang selalu terlihat. Ini sebenarnya gabungan dari Konsep 1 (properti ringkas) + Konsep 4 (activity feed terpadu) di dokumen Round 1, tapi dieksekusi dengan detail yang lebih matang — makanya polanya enak dilihat.

Lima saran di bawah ini SEMUANYA memakai kerangka 2 kolom ala ClickUp itu sebagai dasar — bedanya di keputusan detail yang belum dijawab oleh satu screenshot referensi saja, terutama soal **Time Tracking** (fitur di aplikasi ini jauh lebih kaya daripada ClickUp: ada Sesi Kerja/Sesi Review terpisah dan tombol Batalkan Task, sementara ClickUp cuma py satu baris log "tracked time" di Activity).

---

### Saran 1 — Time Tracking Melebur Total ke Fields & Activity (paling mirip ClickUp asli)

Time Tracking tidak lagi jadi widget/kartu terpisah sama sekali. Tombol Mulai/Stop + timer berjalan jadi **satu baris ringkas paling atas di section Fields** (persis level baris "Attachment"/"Project" lainnya). Detail Sesi Kerja & Sesi Review (yang sekarang jadi 2 tab dengan daftar sesi) dipindah jadi entri di **Activity feed** — mis. "Azmy memulai sesi kerja" ... "Azmy menghentikan sesi kerja, durasi 15m" — sama seperti ClickUp mencatat "tracked time 15m" sebagai event, bukan tab terpisah.

**Cocok kalau:** ingin paling setia ke referensi, dan history sesi kerja per-task memang jarang dibuka detail satu-satu (cukup tahu totalnya + kapan terjadi).
**Risiko:** kalau user sering perlu lihat daftar semua sesi kerja hari ini secara cepat (bukan tercampur di feed umum), informasi ini jadi lebih "tersembunyi" dibanding sekarang.

---

### Saran 2 — Time Tracking Tetap Kartu Sendiri, tapi Full-Width di Atas (bukan di salah satu kolom)

Time Tracking dipertahankan sebagai kartu ringkas dengan tombol Mulai/Stop + tab Sesi Kerja/Sesi Review seperti sekarang (fiturnya tidak dikorbankan), tapi **posisinya dipindah jadi strip horizontal penuh di ATAS pembagian 2 kolom** — bukan lagi menghuni salah satu kolom yang bikin tinggi kolom itu tidak seimbang dengan yang lain. Di bawah strip ini baru pembagian 2 kolom: kiri Fields (gaya tabel ClickUp), kanan Activity + Komentar persisten.

**Cocok kalau:** Time Tracking dianggap fitur inti yang harus tetap menonjol/detail seperti sekarang, tapi masalah "ruang kosong di kolom kiri" tetap mau diselesaikan.
**Risiko:** modal jadi butuh sedikit lebih tinggi karena ada 3 "lapisan" (strip Time Tracking + 2 kolom di bawahnya), bukan cuma 2 kolom.

---

### Saran 3 — Fields Jadi Grid 2 Kolom Ringkas (bukan daftar 1 kolom vertikal)

Task di aplikasi ini punya 9 field (Proyek, Klien, Prioritas, Tipe, Assignee, Tanggal Mulai, Tanggal Tempo, Estimasi Jam, + Status) — lebih banyak dari contoh ClickUp yang dikirim. Kalau ditata 1 kolom vertikal persis seperti referensi, kolom kiri tetap panjang. Jadi field-field pendek (Prioritas, Tipe, Tanggal, Estimasi Jam) ditata **grid 2 kolom label-value berdampingan** supaya lebih ringkas & sedikit scroll, sementara field yang butuh ruang lebih (Assignee dengan foto profil, Klien/Proyek dengan pencarian) tetap 1 baris penuh. Kolom kanan (Activity) tetap persisten seperti referensi.

**Cocok kalau:** prioritas utama adalah meminimalkan scroll di kolom kiri, tanpa mengurangi jumlah field yang ditampilkan.
**Risiko:** grid 2 kolom butuh lebih banyak kerja desain per tipe field (mana yang cukup setengah lebar, mana yang harus penuh) dibanding tabel 1 kolom yang seragam.

---

### Saran 4 — Activity dengan Filter & "Sembunyikan Riwayat Lama" (fokus di sisi kanan)

Meniru detail kecil yang ada di screenshot referensi tapi sering diabaikan: ikon **filter** di header Activity (untuk menyaring "Semua Aktivitas" / "Komentar Saja" / "Perubahan Saja") dan tautan **"Sembunyikan"** yang meng-collapse event-event lama secara berkelompok. Ini penting khusus untuk task yang riwayatnya sudah panjang (banyak reassign, ganti status berkali-kali) — tanpa filter, panel Activity bisa jadi sangat panjang dan menenggelamkan komentar yang justru paling ingin dibaca user.

**Cocok kalau:** aplikasi ini nantinya juga mencatat banyak jenis event (reassign, ubah tanggal, ubah estimasi, dsb.) di Activity — bukan cuma status & komentar seperti sekarang — supaya feed tidak "berisik".
**Risiko:** butuh kerja tambahan menandai setiap jenis event dengan kategori (komentar vs perubahan) supaya filter berfungsi benar.

---

### Saran 5 — Scroll 2 Kolom Independen + Kotak Komentar Selalu Terlihat (sticky)

Fokusnya bukan tata letak visual, tapi **mekanisme interaksi**: kolom kiri (Fields) dan kolom kanan (Activity) scroll SENDIRI-SENDIRI, tidak saling mempengaruhi — user bisa scroll lihat semua field tanpa Activity ikut bergeser, dan sebaliknya (persis seperti 2 scrollbar terpisah yang terlihat di screenshot referensi). Kotak "Tulis komentar..." **selalu menempel (sticky) di bagian bawah kolom kanan**, tidak pernah perlu di-scroll untuk ditemukan — beda dengan desain saat ini di mana kotak komentar ada di tengah-tengah scroll panjang, gampang "hilang" dari pandangan.

**Cocok kalau:** ingin perbaikan yang dampaknya langsung terasa di PENGALAMAN memakai (bukan cuma tampilan), effort implementasi relatif kecil karena tidak mengubah struktur konten, cuma perilaku scroll & posisi elemen.
**Risiko:** paling minim di antara kelima saran — cocok digabung dengan saran manapun (1-4) sebagai "lapisan" perbaikan tambahan, bukan pilihan yang berdiri sendiri.

---

## Ringkasan cepat

| # | Saran | Menjawab pertanyaan | Effort |
|---|-------|----------------------|--------|
| 1 | Time Tracking melebur ke Fields & Activity | Paling setia ke referensi ClickUp | Menengah (perlu ubah data sesi jadi event feed) |
| 2 | Time Tracking full-width di atas, 2 kolom di bawah | Time Tracking tetap detail, ruang kosong tetap hilang | Rendah–Menengah |
| 3 | Fields grid 2 kolom | Kolom kiri lebih ringkas meski field lebih banyak dari ClickUp | Menengah |
| 4 | Activity dengan filter & collapse lama | Activity tidak "berisik" kalau riwayat panjang | Menengah (perlu kategorisasi event) |
| 5 | Scroll independen + komentar sticky | Pengalaman pakai lebih nyaman, bukan cuma tampilan | Rendah — bisa ditumpuk ke saran manapun |

Saran 5 sifatnya independen (seperti Konsep 4 di Round 1) — bisa digabung ke saran 1, 2, 3, atau 4 manapun yang dipilih.

## Sumber

- Screenshot referensi yang Anda kirim (ClickUp task detail view, dark mode).
- [Task layouts — ClickUp Help](https://help.clickup.com/hc/en-us/articles/29665520762647-Task-layouts)
- [Show Custom Fields in tasks and views — ClickUp Help](https://help.clickup.com/hc/en-us/articles/6330455628439-Show-Custom-Fields-in-tasks-and-views)
- [View hidden Custom Fields on tasks — ClickUp Help](https://help.clickup.com/hc/en-us/articles/34157890346519-View-hidden-Custom-Fields-on-tasks)
