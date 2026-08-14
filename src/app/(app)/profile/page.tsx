import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import ProfileView from '@/components/profile-view';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Bugfix (permintaan user Round 7, poin 1): lihat catatan lengkap di src/app/(app)/tasks/page.tsx
  // — `mx-auto` dihapus supaya sisi KIRI kartu ini rata dengan gutter halaman lain (mengikuti
  // Dashboard), bukan mengambang di tengah dengan celah kosong besar di kanan pada layar lebar.
  // `max-w-2xl` TETAP dipertahankan (beda dengan 8 halaman lain yang berisi tabel/board) karena
  // konten di sini murni form (Nama/Email/Telp/Departemen + ganti password) — form selebar layar
  // penuh justru kurang nyaman dibaca/diisi, bukan masalah spacing yang dikeluhkan.
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Profil Saya</h1>
      <ProfileView />
    </div>
  );
}
