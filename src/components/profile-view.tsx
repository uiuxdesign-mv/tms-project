'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/csrf-client';
import AvatarEditor from '@/components/avatar-editor';

type ProfileData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  status: string;
  photo_url?: string;
};

/**
 * Self-service Profile (Fase 8) — user mengubah nama/email/telp/departemen sendiri (tanpa perlu
 * admin), plus ganti password sendiri dengan verifikasi password lama.
 * Fase 17 (permintaan user): upload/ganti/hapus foto profil sendiri sekarang JUGA tersedia di
 * sini, dengan penyesuaian posisi & crop (komponen sama dengan Master User Add/Edit — lihat
 * AvatarEditor) — sebelumnya sengaja dikecualikan, sekarang sudah didukung lewat proxy foto yang
 * sama (`/api/users/[id]/photo`, Google Drive) yang dipakai Master User.
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

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
      setPhotoFile(null);
      // Bugfix (Fase 18, permintaan user): sertakan `?v=` (Drive file ID kolom photo_url) supaya
      // browser tidak menampilkan foto LAMA dari cache-nya sendiri (endpoint proxy foto dikirim
      // dengan header cache 1 jam) — lihat catatan lengkap di UserAvatar (users-table.tsx).
      setPhotoPreview(json.data.photo_url ? `/api/users/${json.data.id}/photo?v=${encodeURIComponent(json.data.photo_url)}` : null);
      setRemovePhoto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat profil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handlePhotoReady(file: File, previewUrl: string) {
    setPhotoFile(file);
    setPhotoPreview(previewUrl);
    setRemovePhoto(false);
  }

  function handlePhotoRemove() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setSavedMsg(null);
    try {
      // Fase 17: dikirim sebagai FormData (bukan JSON) supaya foto profil (kalau dipilih/di-crop)
      // ikut terkirim dalam satu request yang sama, konsisten dengan pola Add/Edit User.
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => formData.append(key, value));
      if (photoFile) formData.append('photo', photoFile);
      else if (removePhoto) formData.append('remove_photo', '1');

      const res = await apiFetch('/api/profile', { method: 'PATCH', body: formData });
      const json = await res.json();
      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else setError(json.error || 'Gagal menyimpan profil.');
        return;
      }
      setSavedMsg('Profil berhasil disimpan.');
      setPhotoFile(null);
      setRemovePhoto(false);
      // Bugfix (Fase 18): sertakan `?v=` supaya langsung menampilkan foto BARU, bukan foto lama
      // dari cache browser (lihat catatan lengkap di UserAvatar, users-table.tsx).
      setPhotoPreview(json.data.photo_url ? `/api/users/${json.data.id}/photo?v=${encodeURIComponent(json.data.photo_url)}` : null);
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

  if (loading)
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-400 shadow-card">
        Memuat...
      </div>
    );
  if (error && !profile) return <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  const initial = (profile?.name || '?').trim().slice(0, 1).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Data Profil</h2>
        </div>
        <div className="p-5">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <AvatarEditor
                label={null}
                previewUrl={photoPreview}
                fallbackInitial={initial}
                onFileReady={handlePhotoReady}
                onRemove={handlePhotoRemove}
                canRemove={!!photoPreview}
                error={fieldErrors.photo}
              />
              <div className="text-sm text-gray-500">
                <p className="font-medium text-gray-900">{profile?.name}</p>
                <p>{profile?.email}</p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Nama *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Budi Santoso"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
              />
              {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nama@perusahaan.com"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
              />
              {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Telepon</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Contoh: 081234567890"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Departemen</label>
                <input
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  placeholder="Contoh: Marketing"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {savedMsg && <p className="text-sm text-emerald-700">{savedMsg}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Profil'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Ganti Password</h2>
          <p className="mt-1 text-xs text-gray-500">Wajib memasukkan password saat ini untuk verifikasi.</p>
        </div>
        <div className="p-5">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password Saat Ini</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Masukkan password Anda saat ini"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
              />
              {pwErrors.currentPassword && <p className="mt-1 text-xs text-red-600">{pwErrors.currentPassword}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Password Baru</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
                {pwErrors.newPassword && <p className="mt-1 text-xs text-red-600">{pwErrors.newPassword}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password baru"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-ring"
                />
                {pwErrors.confirmPassword && <p className="mt-1 text-xs text-red-600">{pwErrors.confirmPassword}</p>}
              </div>
            </div>

            {pwError && <p className="text-sm text-red-600">{pwError}</p>}
            {pwSavedMsg && <p className="text-sm text-emerald-700">{pwSavedMsg}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pwSaving}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {pwSaving ? 'Menyimpan...' : 'Ganti Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
