'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/csrf-client';

type ProfileData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  status: string;
};

/**
 * Self-service Profile (Fase 8) — user mengubah nama/email/telp/departemen sendiri (tanpa perlu
 * admin), plus ganti password sendiri dengan verifikasi password lama. TIDAK termasuk upload foto
 * profil — sengaja dikecualikan (alasan arsitektural: Google Sheets/serverless tanpa persistent
 * blob storage, dicatat di AUDIT-KOMPARASI-OLD-vs-NEW.md sebagai gap yang sah, bukan oversight).
 * Forgot/Reset Password lewat email JUGA sengaja tidak dibangun di fase ini (butuh keputusan
 * penyedia layanan email dari pemilik produk) — ganti password di sini tetap mewajibkan tahu
 * password lama, sama seperti aplikasi lama.
 */
export default function ProfileView() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', email: '', phone: '', department: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSavedMsg, setPwSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/profile');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memuat profil.');
      setProfile(json.data);
      setForm({
        name: json.data.name,
        email: json.data.email,
        phone: json.data.phone || '',
        department: json.data.department || '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat profil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setSavedMsg(null);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else setError(json.error || 'Gagal menyimpan profil.');
        return;
      }
      setSavedMsg('Profil berhasil disimpan.');
      router.refresh();
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwErrors({});
    setPwSavedMsg(null);

    if (newPassword !== confirmPassword) {
      setPwErrors({ confirmPassword: 'Konfirmasi password tidak cocok.' });
      return;
    }

    setPwSaving(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.fieldErrors) setPwErrors(json.fieldErrors);
        else setPwError(json.error || 'Gagal mengganti password.');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwSavedMsg('Password berhasil diganti.');
    } catch {
      setPwError('Terjadi kesalahan jaringan.');
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-400 shadow-sm">Memuat...</div>;
  if (error && !profile) return <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Data Profil</h2>
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nama *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Telepon</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Departemen</label>
              <input
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {savedMsg && <p className="text-sm text-green-700">{savedMsg}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Profil'}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Ganti Password</h2>
        <p className="mb-4 text-xs text-gray-500">Wajib memasukkan password saat ini untuk verifikasi.</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password Saat Ini</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {pwErrors.currentPassword && <p className="mt-1 text-xs text-red-600">{pwErrors.currentPassword}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Password Baru</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              {pwErrors.newPassword && <p className="mt-1 text-xs text-red-600">{pwErrors.newPassword}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Konfirmasi Password Baru</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              {pwErrors.confirmPassword && <p className="mt-1 text-xs text-red-600">{pwErrors.confirmPassword}</p>}
            </div>
          </div>

          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwSavedMsg && <p className="text-sm text-green-700">{pwSavedMsg}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwSaving}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {pwSaving ? 'Menyimpan...' : 'Ganti Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
