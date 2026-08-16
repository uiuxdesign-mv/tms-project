/**
 * Bar chart vertikal generik (Fase 11 — Dashboard "Tasks per Project"/"Tasks per Client"/
 * "Assignee Workload"). Dipisah dari `WeeklyTrendChart` (yang API-nya spesifik untuk bucket
 * mingguan due-date & dipakai juga oleh halaman Report) supaya tidak mengubah kontrak komponen
 * yang sudah ada. Komponen murni, aman dipakai dari Server maupun Client Component.
 */
export type BarChartItem = { key: string; label: string; count: number };

export function VerticalBarChart({
  items,
  emptyLabel = 'Tidak ada data.',
  maxItems,
  barClassName = 'bg-sky-600',
}: {
  items: BarChartItem[];
  emptyLabel?: string;
  maxItems?: number;
  barClassName?: string;
}) {
  const shown = maxItems ? items.slice(0, maxItems) : items;
  const max = Math.max(1, ...shown.map((i) => i.count));

  if (shown.length === 0 || shown.every((i) => i.count === 0)) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    // Bugfix (permintaan user Round 8): kartu chart yang memakai komponen ini ("Tugas per Proyek/
    // Klien", "Beban Kerja Assignee") bisa meluber keluar dari kotak kartunya, bahkan sampai
    // terpotong tepi layar — BUKAN cuma masalah kosmetik kecil seperti chart Productivity Trend
    // yang sudah diperbaiki di ronde sebelumnya, melainkan seluruh kartu ikut melebar. Akar
    // masalahnya: `min-w-0` di bawah TIDAK ADA sebelumnya. Setiap item di sini adalah flex child
    // `flex-1`, dan browser secara default memberi flex child ukuran minimum = lebar KONTEN
    // ASLINYA (belum terpotong) kalau `min-width` tidak diset — jadi kalau label klien/nama
    // assignee panjang (mis. "PT Paragon Technology and Partners"), `truncate` di span label TIDAK
    // BISA benar-benar memotong teksnya, karena item flex ini menolak menyusut lebih kecil dari
    // lebar teks penuh tsb. Akibatnya baris flex ini (dan kartu di atasnya, lihat ChartCard di
    // dashboard-view.tsx/reports-view.tsx yang JUGA diberi `min-w-0` untuk alasan sama) ikut
    // melebar mengikuti label terpanjang, mendorong kolom grid ke-3 sampai keluar viewport.
    // `min-w-0` di sini mengizinkan item menyusut sekecil yang grid/flex induk berikan, baru
    // setelah itu `truncate` benar-benar bisa memotong teks dengan "...".
    // Perbaikan (permintaan user, "sesuaikan ukuran semua tampilan menjadi 80%"): tinggi 160 di
    // sini diganti ke '10rem' (setara 160px di skala 100%) — style inline pakai px MENTAH (bukan
    // Tailwind), jadi tidak otomatis ikut menyusut waktu font-size root dikecilkan (lihat
    // globals.css) kalau tetap angka polos.
    <div className="flex items-end gap-2" style={{ height: '10rem' }}>
      {shown.map((item) => {
        const heightPct = (item.count / max) * 100;
        return (
          <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
            <span className="text-[0.625rem] text-gray-500">{item.count > 0 ? item.count : ''}</span>
            <div
              className={`w-full rounded-t ${barClassName}`}
              style={{ height: `${Math.max(2, heightPct)}%`, minHeight: item.count > 0 ? 4 : 0 }}
              title={`${item.label}: ${item.count}`}
            />
            <span className="w-full truncate text-center text-[0.625rem] text-gray-400" title={item.label}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
