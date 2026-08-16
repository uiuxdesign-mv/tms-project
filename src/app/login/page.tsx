'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/csrf-client';
import { useLanguage } from '@/components/language-provider';
import { useTheme } from '@/components/theme-provider';
import { useToast } from '@/components/toast-provider';

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  // Perbaikan (permintaan user Round 6, poin 4): halaman login sebelumnya tidak punya kontrol
  // tema (dark/light) maupun bahasa sama sekali, padahal shell aplikasi setelah login sudah punya
  // keduanya — tutup dropdown bahasa kalau user klik di luar area-nya, sama seperti di app-shell.tsx.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('toast_login_failed'));
        toast.error(data.error || t('toast_login_failed'));
        return;
      }
      // Bugfix (Round 22, permintaan user poin 2 — "loading ketika login masih sangat lama"):
      // sebelumnya `router.push()` DAN `router.refresh()` dipanggil berurutan — push() sendiri
      // sudah memicu navigasi (fetch RSC payload Dashboard dari server, menjalankan AppGroupLayout
      // + DashboardPage penuh), lalu refresh() SEGERA setelahnya memaksa Next.js membuang cache
      // route yang baru saja diambil push() dan menge-fetch ulang route yang sama dari server dari
      // awal — akibatnya seluruh rantai data Dashboard (session, menu access, ringkasan Task,
      // komentar, time tracking, audit log) dikerjakan DUA KALI untuk satu kali login, membuat
      // transisi login terasa dua kali lebih lama dari seharusnya. `refresh()` di sini tidak
      // dibutuhkan sama sekali — /dashboard adalah navigasi ke route yang belum pernah dibuka
      // sesi ini (tidak ada Router Cache basi untuk dibuang), dan datanya (session-dependent, lihat
      // getSession() di setiap Server Component) selalu dihitung ulang dari cookie sesi yang baru
      // di-set, bukan dari cache manapun.
      router.push('/dashboard');
    } catch {
      setError(t('toast_network_error'));
      toast.error(t('toast_network_error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      {/* Kontrol tema (dark/light) & bahasa (permintaan user Round 6, poin 4) — diletakkan mengambang
          di pojok kanan atas supaya terlihat di kedua panel (brand & form) dan di layar kecil sekalipun
          (panel brand disembunyikan di bawah breakpoint lg). Markup & perilaku diadaptasi dari topbar
          app-shell.tsx (langOpen/langRef, toggleTheme) supaya konsisten dengan shell setelah login. */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
        <div ref={langRef} className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            title={t('lang_switch')}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white/90 px-2.5 text-sm font-medium text-gray-500 backdrop-blur transition-colors hover:bg-white hover:text-gray-900"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 000 18M12.5 3a17 17 0 010 18"
              />
            </svg>
            <span className="hidden sm:inline">{lang === 'id' ? t('lang_abbr_id') : t('lang_abbr_en')}</span>
            <svg
              className={`h-3.5 w-3.5 transition-transform ${langOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {langOpen && (
            <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-popover">
              {(['id', 'en'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLang(code);
                    setLangOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-sm ${
                    lang === code ? 'font-medium text-indigo-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {code === 'id' ? t('lang_abbr_id') : t('lang_abbr_en')}
                  {lang === code && (
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white/90 text-gray-500 backdrop-blur transition-colors hover:bg-white hover:text-gray-900"
          title={theme === 'dark' ? t('theme_to_light') : t('theme_to_dark')}
          aria-label={theme === 'dark' ? t('theme_to_light') : t('theme_to_dark')}
        >
          {theme === 'dark' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
              />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-6.364-.386l1.591-1.591M3 12h2.25m.386-6.364l1.591 1.591M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Panel brand — hanya tampil di layar besar, meniru layouts/auth.php aplikasi lama.
          Bugfix (permintaan user Round 6, poin 4): panel ini SENGAJA selalu gelap (bg-indigo-950,
          tidak ikut ditimpa oleh scope `.dark` di globals.css — lihat catatan di sana), tapi teks &
          ikon di dalamnya sebelumnya pakai `text-white`/`bg-white/15` yang justru IKUT ditimpa
          (--color-white dipetakan ulang jadi abu-abu gelap di mode dark, karena dipakai juga sebagai
          warna "permukaan" kartu/modal yang harus berbalik gelap<->terang). Akibatnya di mode dark,
          teks & badge ikon di panel yang tetap gelap ini jadi nyaris tidak kontras (gelap di atas
          gelap). Diperbaiki dengan memakai token dasar `--tms-white` (tidak pernah ditimpa oleh
          `.dark`) lewat notasi arbitrary value, supaya panel ini selalu putih terlepas dari tema. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-indigo-950 p-12 text-[var(--tms-white)] lg:flex">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1), transparent 40%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--tms-white)]/15">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
          </span>
          {t('login_brand_name')}
        </div>
        <div className="relative z-10">
          <h2 className="mb-3 text-3xl font-semibold leading-tight">
            {t('login_hero_line1')}
            <br />
            {t('login_hero_line2')}
            <br />
            {t('login_hero_line3')}
          </h2>
          <p className="max-w-sm text-indigo-200">{t('login_hero_subtitle')}</p>
        </div>
        <p className="relative z-10 text-sm text-indigo-300">© {new Date().getFullYear()} {t('login_brand_name')}</p>
      </div>

      {/* Panel form */}
      <div className="flex items-center justify-center bg-gray-50 p-6 sm:p-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8">
            <h2 className="mb-1 text-2xl font-semibold text-gray-900">{t('login_welcome_title')}</h2>
            <p className="text-sm text-gray-500">{t('login_welcome_subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="w-full">
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-900">
                {t('login_email')}
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors duration-150 focus-ring focus:border-indigo-500"
              />
            </div>

            <div className="w-full">
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-900">
                {t('login_password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors duration-150 focus-ring focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={t('login_toggle_password_aria')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5 1.319 0 2.577-.24 3.734-.678M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="remember" className="inline-flex cursor-pointer select-none items-center gap-2">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus-ring"
                />
                <span className="text-sm text-gray-500">{t('login_remember_me')}</span>
              </label>
              {/* Fase 12 (QA sesuai video): link ini ada di video tapi aplikasi belum punya alur
                  reset password lewat email (tidak ada layanan email) — tampilkan info kontak
                  admin, bukan link mati, supaya tetap jujur ke user. */}
              <button
                type="button"
                onClick={() => toast.info(t('toast_login_reset_unavailable'))}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                {t('login_forgot_password')}
              </button>
            </div>

            {error && (
              <p className="flex items-center gap-1 text-sm text-red-600" role="alert">
                <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.28 11.163c.75 1.332-.213 2.987-1.743 2.987H3.72c-1.53 0-2.493-1.655-1.743-2.987L8.257 3.1zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"
                    clipRule="evenodd"
                  />
                </svg>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              // Bugfix (Round 6, poin 4): sama seperti panel brand di atas — bg-indigo-600 tombol ini
              // tidak ikut berubah di mode dark, jadi teks/ikon spinner-nya dipaksa tetap putih lewat
              // token dasar --tms-white (bukan `text-white` yang ikut ditimpa `.dark`).
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-[var(--tms-white)] shadow-sm transition-colors duration-150 hover:bg-indigo-700 focus-ring disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? t('login_submitting') : t('login_submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
