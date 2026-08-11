import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import ProfileView from '@/components/profile-view';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Profil Saya</h1>
      <ProfileView />
    </div>
  );
}
