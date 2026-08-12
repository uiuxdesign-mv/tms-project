'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/csrf-client';

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
    >
      Keluar
    </button>
  );
}
