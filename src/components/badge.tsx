'use client';

import { useLanguage } from '@/components/language-provider';

// Komponen Badge generik meniru components/Badge.php aplikasi lama: pill kecil rounded-full
// dengan 5 "tone" warna (neutral/success/warning/danger/info), atau warna custom (hex) untuk
// badge Status task yang warnanya dikonfigurasi admin lewat Master Status.
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-500',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
};

export function Badge({
  label,
  tone = 'neutral',
  color,
  className = '',
}: {
  label: React.ReactNode;
  tone?: BadgeTone;
  /** Warna hex kustom (mis. dari Master Status) — kalau diisi, tone diabaikan. */
  color?: string | null;
  className?: string;
}) {
  const style = color
    ? { backgroundColor: `${color}22`, color }
    : undefined;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${color ? '' : TONE_CLASS[tone]} ${className}`}
      style={style}
    >
      {label}
    </span>
  );
}

/** Badge Aktif/Tidak Aktif — dipakai di semua tabel Master Data & Users untuk kolom Status.
 *  Bugfix (permintaan user, item i18n): label badge ini sebelumnya hardcode Bahasa Indonesia,
 *  tidak ikut berganti saat toggle ID/EN — sekarang diresolusi lewat t(). */
export function StatusBadge({ value }: { value: string }) {
  const { t } = useLanguage();
  const active = value === 'Active' || value === 'active' || value === 'Aktif';
  return <Badge label={active ? t('status_active_label') : t('status_inactive_label')} tone={active ? 'success' : 'danger'} />;
}
