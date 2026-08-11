import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import ProfileView from '@/components/profile-view';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Kembali ke Dashboard
          </Link>
        </div>
        <h1 className="mb-4 text-xl font-semibold text-gray-900">Profil Saya</h1>
        <ProfileView />
      </div>
    </div>
  );
}
