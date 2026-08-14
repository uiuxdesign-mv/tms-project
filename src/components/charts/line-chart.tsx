/**
 * Line chart ringan (Fase 11 — Dashboard "Productivity Trend") tanpa dependency chart library
 * baru: dirender pakai SVG polyline + area fill sederhana. Komponen murni, aman dipakai dari
 * Server maupun Client Component.
 */
export type LineChartPoint = { key: string; label: string; value: number };

const WIDTH = 300;
const HEIGHT = 120;
const PADDING_TOP = 8;

export function LineChart({
  points,
  emptyTitle = 'No data yet',
  emptyCaption,
  valueSuffix = 'h',
}: {
  points: LineChartPoint[];
  emptyTitle?: string;
  emptyCaption?: string;
  valueSuffix?: string;
}) {
  const hasData = points.length > 0 && points.some((p) => p.value > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        </span>
        <p className="text-sm text-gray-500">{emptyTitle}</p>
        {emptyCaption && <p className="max-w-[220px] text-xs text-gray-400">{emptyCaption}</p>}
      </div>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.value));
  const usableHeight = HEIGHT - PADDING_TOP;
  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = points.length > 1 ? i * step : WIDTH / 2;
    const y = PADDING_TOP + usableHeight - (p.value / max) * usableHeight;
    return { x, y, point: p };
  });
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${HEIGHT} L${coords[0].x.toFixed(1)},${HEIGHT} Z`;

  // Batasi label sumbu-x supaya tidak berdesakan kalau titik terlalu banyak (mis. 31 hari).
  const labelStride = Math.max(1, Math.ceil(points.length / 8));

  return (
    // Bugfix (permintaan user Round 7, poin 2): chart "Productivity Trend" di Dashboard sebelumnya
    // bisa keluar dari kotak kartunya (ChartCard) — dua penyebab, sudah diperbaiki di bawah:
    // (1) label sumbu-x titik pertama & terakhir dipusatkan lewat `-translate-x-1/2` PERSIS di
    //     tepi kiri (0%) / kanan (100%) chart, jadi separuh lebar teksnya menjorok keluar
    //     melewati tepi kartu — sekarang titik pertama rata kiri (translate-x-0) & titik terakhir
    //     rata kanan (-translate-x-full), cuma titik TENGAH yang tetap dipusatkan.
    // (2) svg dipasang `overflow-visible` supaya titik data di x=0/x=WIDTH tidak terpotong separuh
    //     (radius lingkaran menjorok sedikit ke luar viewBox) — sengaja dipertahankan (radiusnya
    //     cuma beberapa piksel), tapi sekarang dibungkus div dengan `overflow-hidden` di sini
    //     supaya tetap ada jaring pengaman terakhir: apa pun yang menjorok tidak akan pernah
    //     tembus keluar dari kotak kartu, sekecil apa pun kemungkinannya.
    <div className="overflow-hidden">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-32 w-full overflow-visible">
        <path d={areaPath} fill="rgb(79 70 229 / 0.08)" stroke="none" />
        <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={points[i].key} cx={c.x} cy={c.y} r={2.5} fill="#4f46e5">
            <title>
              {points[i].label}: {points[i].value.toFixed(1)}
              {valueSuffix}
            </title>
          </circle>
        ))}
      </svg>
      <div className="relative mt-1 h-4 text-[10px] text-gray-400">
        {coords
          .filter((_, i) => i % labelStride === 0 || i === coords.length - 1)
          .map((c) => {
            const pct = (c.x / WIDTH) * 100;
            // Titik pertama (0%): rata kiri, tidak digeser sama sekali. Titik terakhir (100%):
            // rata kanan, digeser penuh -100% supaya ujung kanan teks pas di tepi. Titik tengah
            // lainnya: tetap dipusatkan seperti semula.
            const alignClass = pct <= 0 ? 'translate-x-0' : pct >= 100 ? '-translate-x-full' : '-translate-x-1/2';
            return (
              <span
                key={c.point.key}
                className={`absolute ${alignClass}`}
                style={{ left: `${pct}%` }}
              >
                {c.point.label}
              </span>
            );
          })}
      </div>
    </div>
  );
}
