# Redesign Modal Detail Task — Round 4: 5 Opsi BARU Penempatan Time Tracking

Sebelum menulis 5 opsi ini, saya coba mundur dulu dan memikirkan ulang masalah intinya secara UX, bukan cuma variasi visual dari Round 3:

**Masalah sebenarnya bukan "di mana taruh Time Tracking", tapi 2 kebutuhan yang saling tarik-menarik:**
1. **Kebutuhan monitoring** — kalau sesi sedang berjalan/dijeda, user (terutama yang mengerjakan task-nya) perlu tahu status itu SETIAP SAAT, idealnya tanpa harus scroll/klik apa pun — ini kebutuhan "ambient awareness", sama seperti kenapa pemutar musik (Spotify/Apple Music) selalu punya mini-player yang menempel di layar walau Anda sedang membuka layar lain.
2. **Kebutuhan hemat ruang** — kalau TIDAK ada sesi aktif (task belum mulai dikerjakan, atau memang lagi tidak difokuskan Time Tracking-nya), detail sesi (tabel riwayat, 3 statistik) adalah informasi "on-demand" yang jarang dibutuhkan setiap saat — cocok disembunyikan sampai diminta, prinsip **progressive disclosure** (jangan tampilkan semua di awal, cukup jalan masuk untuk membukanya kalau dibutuhkan).

Round 3 sudah menjawab kebutuhan #2 (strip ringkas) tapi caranya statis (semua opsi Round 3 = 1 mekanisme tetap, tidak peduli task-nya sedang berjalan atau idle). Round 4 ini saya coba jawab KEDUANYA sekaligus dengan mekanisme yang lebih pintar — termasuk 1 opsi yang perilakunya BERUBAH otomatis mengikuti kondisi sesi, bukan cuma menunggu diklik user.

---

### Opsi 6 — Docked Mini-Bar di Header Modal (Sticky)

Timer + status + tombol Mulai/Stop (ikon saja, sangat ringkas) ditempel LANGSUNG di baris header modal, sejajar dengan judul task & badge status — bukan lagi di kolom kiri sama sekali. Karena header modal biasanya tidak ikut ter-scroll, indikator ini **selalu terlihat** apa pun yang sedang dilihat/di-scroll user di badan modal. Diklik, sebuah panel detail (3 statistik + tab Sesi Kerja/Review + tombol Batalkan Task) turun/slide dari bawah header, menutupi sementara bagian atas kolom kiri-kanan.

**Kenapa ini beda secara UX dari Round 3:** memisahkan "ambient awareness" (selalu di header, tidak makan tempat kolom) dari "detail on-demand" (baru muncul saat diklik) — user yang cuma perlu tahu "masih jalan atau tidak" tidak perlu buka apa pun.
**Referensi:** mini-player Spotify/Apple Music yang menempel di bagian bawah/atas layar; browser tab yang menampilkan ikon kecil saat tab memutar audio.
**Risiko:** header jadi sedikit lebih ramai (judul + badge status + kontrol timer dalam 1 baris) — perlu dipastikan tidak "sesak" di layar sempit.

---

### Opsi 7 — Persistent Action Bar di Footer + Drawer "Detail Waktu"

Footer modal (yang sekarang sudah berisi timestamp Dibuat/Diperbarui + tombol Simpan/Tutup) diperluas jadi tempat kontrol Time Tracking yang SELALU terlihat — badge status + timer + tombol Mulai/Stop/Batalkan Task langsung jadi bagian dari footer, karena footer memang posisinya tetap (fixed) di bawah layar tak peduli konten di atasnya sepanjang apa. Detail lengkap (3 statistik + tabel sesi) dibuka lewat tautan kecil "Detail Waktu ▲" di footer itu, yang membuka **drawer tarik-ke-atas** menutupi sebagian badan modal dari bawah.

**Kenapa ini beda:** footer punya sifat "selalu bisa dijangkau" (ala Fitts's Law — target yang menempel di tepi layar lebih cepat & mudah diklik) sekaligus "selalu terlihat" tanpa scroll — cocok untuk kontrol yang sering dipakai berulang kali (mulai/jeda/stop) dibanding taruh di tengah konten yang panjang.
**Referensi:** action bar aplikasi musik/podcast di mobile (kontrol utama selalu di bawah), pola "sticky footer toolbar" di Gmail compose.
**Risiko:** footer jadi 2 baris (baris kontrol Time Tracking + baris timestamp/Simpan/Tutup) — perlu desain supaya tidak terasa terlalu tinggi/berat di layar kecil.

---

### Opsi 8 — Tab Level MODAL (bukan cuma kolom kiri): "Detail" vs "Time Tracking"

Alih-alih sub-tab kecil yang terjepit di kolom kiri (seperti Round 3 Opsi 5), Time Tracking naik jadi **tab setingkat modal**, sejajar dengan judul — mis. dua tab besar "Detail" (isinya: Fields + Activity 2 kolom, tampilan default) dan "Time Tracking" (mengambil alih SELURUH badan modal, bukan cuma kolom kiri, jadi 3 statistik + tabel sesi Kerja/Review dapat ruang penuh & lega, tidak berdesakan dengan Fields).

**Kenapa ini beda:** Round 3 Opsi 5 memaksa Time Tracking tetap "berbagi" ruang sempit kolom kiri walau lagi ditampilkan; di sini saat user memang niat mau lihat/atur Time Tracking, ia dapat kanvas penuh, jadi tabel riwayat sesi bisa lebih lega & mudah dibaca (kolom durasi/pelaku tidak perlu dipepetkan).
**Referensi:** pola "Conversation / Commits / Checks / Files changed" tab di GitHub Pull Request — tiap tab menguasai seluruh area konten, bukan berbagi kolom.
**Risiko:** butuh indikator status berjalan yang tetap terlihat walau user sedang di tab "Detail" (mis. titik hijau berkedip di label tab "Time Tracking", sama seperti solusi Round 3 Opsi 5) — kalau tidak, sesi yang sedang berjalan bisa "terlupakan".

---

### Opsi 9 — Bottom Sheet yang Bisa Ditarik (Drag Handle)

Indikator kecil (dot status + timer, sangat minimal) menempel dekat judul task. Detail penuh Time Tracking hidup di **bottom sheet** — panel yang bisa ditarik naik dari tepi bawah modal (ada handle kecil di tengah atas panel sebagai penanda "bisa digeser"), menutupi sebagian konten saat dibuka, bisa ditarik-tutup lagi. Beda dari popover (Round 3 Opsi 4) yang berupa kotak kecil melayang di satu titik — bottom sheet ini selebar modal dan terasa seperti "lapisan" resmi, bukan tooltip.

**Kenapa ini beda:** bottom sheet memberi kesan "sengaja dibuka" yang lebih kuat/stabil dibanding popover kecil (cocok untuk konten sepenuhnya interaktif seperti tabel sesi + tombol aksi, bukan cuma info sekilas), dan familiar buat user yang terbiasa pakai aplikasi mobile.
**Referensi:** komponen [Bottom Sheet — Material Design](https://m3.material.io/components/bottom-sheets/overview), pola "swipe up for details" di Google Maps.
**Risiko:** paling "berat" secara interaksi dari kelima opsi (perlu animasi geser & area drag yang presisi) — mockup statis di bawah ini disederhanakan jadi klik biasa untuk buka/tutup, bukan drag sungguhan.

---

### Opsi 10 — Progressive Disclosure Otomatis (Adaptif Berdasarkan Status Sesi)

Bukan user yang memutuskan expand/collapse (beda dari SEMUA opsi sebelumnya, termasuk Round 3 Opsi 1) — **sistem yang memutuskan otomatis** berdasarkan kondisi sesi:
- Kalau **belum ada sesi berjalan sama sekali & timer 00:00:00** (task belum disentuh Time Tracking-nya) → tampil paling ringkas, cuma 1 baris tautan kecil "▶ Mulai Time Tracking" tanpa kartu/border sama sekali.
- Kalau **sesi sedang berjalan ATAU dijeda** (ada progres yang relevan untuk dipantau) → otomatis mengembang jadi kartu penuh (3 statistik + tombol) TANPA perlu diklik — karena saat itu informasinya memang relevan untuk terus terlihat.
- Tabel riwayat sesi lengkap (Sesi Kerja/Review) tetap 1 klik lagi lewat tautan "Lihat semua sesi →" di dalam kartu yang sudah otomatis terbuka itu — jadi hanya tabel detail-nya yang tetap on-demand, bukan status utamanya.

**Kenapa ini beda:** ini satu-satunya opsi yang tidak membebankan keputusan "kapan harus expand" ke user — sistem menyesuaikan diri ke konteks yang paling mungkin relevan saat itu. Ini juga menjawab langsung risiko Opsi 1 Round 3 ("perlu klik ekstra saat sesi sedang berjalan") karena begitu ada sesi aktif, kartu sudah otomatis terbuka.
**Referensi:** prinsip [Progressive Disclosure — Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/) ("show only necessary/relevant information... at each step"); pola notifikasi ambient yang cuma "menonjol" saat ada hal yang butuh perhatian.
**Risiko:** perilaku yang "berubah sendiri" bisa terasa tidak terduga bagi sebagian user di awal (perlu 1x pembiasaan) — dan strip ringkas ("Mulai Time Tracking") sedikit berbeda tampilannya dari mockup asli Anda yang selalu menunjukkan timer "00:00:00 ▶ Mulai" (di sini, saat benar-benar 0 & belum pernah dipakai, malah lebih ringkas lagi dari itu).

---

## Ringkasan cepat

| # | Opsi | Selalu terlihat statusnya tanpa scroll? | Ruang kolom kiri saat idle | Perilaku expand |
|---|------|:---:|---|---|
| 6 | Docked mini-bar di header | Ya (di header) | Tidak makan tempat sama sekali | Manual (klik) |
| 7 | Action bar di footer + drawer | Ya (di footer) | Tidak makan tempat sama sekali | Manual (klik "Detail Waktu") |
| 8 | Tab level modal | Perlu indikator titik di label tab | Tidak makan tempat (pindah tab) | Manual (ganti tab), tapi dapat kanvas PENUH saat dibuka |
| 9 | Bottom sheet (drag) | Indikator mini dekat judul | Nyaris tidak makan tempat | Manual (tarik/klik) |
| 10 | Progressive disclosure otomatis | Ya, otomatis besar saat relevan | Minimal saat benar-benar idle | **Otomatis** mengikuti status sesi |

**Rekomendasi saya kali ini: Opsi 10**, dengan alasan paling kuat secara UX — ia menghilangkan trade-off "ringkas vs selalu-terlihat" yang jadi akar masalah semua opsi lain, karena sistem yang menyesuaikan, bukan user yang harus ingat untuk membuka. Kalau ingin sesuatu yang perilakunya lebih dapat diprediksi (tidak "berubah sendiri"), **Opsi 6** adalah pilihan kedua terkuat — ambient awareness di header adalah pola yang sudah sangat familiar dari aplikasi pemutar media.

## Sumber

- [Progressive Disclosure — Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)
- [Bottom Sheets — Material Design 3](https://m3.material.io/components/bottom-sheets/overview)
- [Fitts's Law — Nielsen Norman Group](https://www.nngroup.com/articles/fitts-law/)
- Pola mini-player Spotify/Apple Music & tab "Files changed" GitHub Pull Request (referensi perilaku umum, bukan tautan dokumentasi spesifik).
