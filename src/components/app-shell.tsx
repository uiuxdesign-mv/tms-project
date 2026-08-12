'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { useLanguage } from '@/components/language-provider';
import { useTheme } from '@/components/theme-provider';
import type { TranslationKey } from '@/lib/i18n/translations';

export type ShellNavLink = {
  key: string;
  label: string;
  /** Kalau diisi, label ini diresolusi lewat t() di client (ID/EN) — dipakai untuk item nav tetap.
   *  Item yang dibangun dinamis dari config (mis. nama entity Master Data) tidak punya translation
   *  key (di luar cakupan i18n Fase 10 — lihat catatan di src/lib/i18n/translations.ts) dan tetap
   *  memakai `label` apa adanya. */
  labelKey?: TranslationKey;
  href: string;
};

export type ShellNavGroup = {
  key: string;
  label: string;
  labelKey?: TranslationKey;
  /** Kalau diisi, grup ini sendiri jadi link langsung (tidak ada anak) — dipakai untuk item tunggal seperti Dashboard/Report. */
  href?: string;
  links?: ShellNavLink[];
};

function resolveLabel(t: (key: TranslationKey) => string, item: { label: string; labelKey?: TranslationKey }): string {
  return item.labelKey ? t(item.labelKey) : item.label;
}

export type AppShellProps = {
  session: { name: string; email: string; roleName: string; photoUrl?: string };
  navGroups: ShellNavGroup[];
  children: React.ReactNode;
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(href + '/');
}

function groupHasActiveChild(pathname: string, group: ShellNavGroup): boolean {
  if (group.href) return isActive(pathname, group.href);
  return (group.links || []).some((l) => isActive(pathname, l.href));
}

// Ikon heroicons-outline (stroke-width 1.5, viewBox 0 0 24 24) — dipilih supaya sama persis
// dengan set ikon yang dipakai layouts/partials/sidebar.php aplikasi lama (bukan emoji).
const ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  tasking: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  report: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  'master-data': (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
    </svg>
  ),
  admin: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  profile: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
};

function iconFor(key: string): React.ReactNode {
  return ICONS[key] ?? ICONS['master-data'];
}

export default function AppShell({ session, navGroups, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  // Grup yang lagi collapsed disimpan sebagai Set of key yang DITUTUP (default semua grup dengan anak aktif otomatis terbuka).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const sidebarContent = (
    <nav className="flex h-full flex-col overflow-y-auto">
      <Link
        href="/dashboard"
        onClick={() => setMobileOpen(false)}
        className="flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 px-5 font-semibold text-gray-900"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">T</span>
        TMS
      </Link>

      <div className="flex-1 space-y-1 px-3 py-4">
        {navGroups.map((group) => {
          if (group.href) {
            const active = isActive(pathname, group.href);
            return (
              <Link
                key={group.key}
                href={group.href}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="shrink-0">{iconFor(group.key)}</span>
                <span className="flex-1">{resolveLabel(t, group)}</span>
              </Link>
            );
          }

          const links = group.links || [];
          if (links.length === 0) return null;
          const hasActiveChild = groupHasActiveChild(pathname, group);
          const collapsed = collapsedGroups.has(group.key) && !hasActiveChild;

          return (
            <div key={group.key} className="pt-2 first:pt-0">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-gray-100 hover:text-gray-900 ${
                  hasActiveChild ? 'text-gray-900' : 'text-gray-500'
                }`}
              >
                <span className="shrink-0">{iconFor(group.key)}</span>
                <span className="flex-1">{resolveLabel(t, group)}</span>
                <svg
                  className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {!collapsed && (
                <div className="ml-8 mt-1 space-y-1 border-l border-gray-200 pl-3">
                  {links.map((link) => {
                    const active = isActive(pathname, link.href);
                    return (
                      <Link
                        key={link.key}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center justify-between py-1.5 text-sm ${
                          active ? 'font-medium text-indigo-700' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        {resolveLabel(t, link)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white md:block print:hidden">{sidebarContent}</aside>

      {/* Sidebar — mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-gray-200 bg-white shadow-modal">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-4 backdrop-blur sm:px-6 print:hidden">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-2 rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label={t('nav_open_menu')}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          <div />

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Language switcher */}
            <div ref={langRef} className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                title={t('lang_switch')}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 000 18M12.5 3a17 17 0 010 18"
                  />
                </svg>
                <span className="hidden sm:inline">{lang === 'id' ? 'Bahasa Indonesia' : 'English'}</span>
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
                      {code === 'id' ? 'Bahasa Indonesia' : 'English'}
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

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
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

            {/* Profile dropdown */}
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-3 hover:opacity-80"
                title={t('nav_profile')}
              >
                {session.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.photoUrl} alt={session.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700">
                    {session.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden text-sm text-gray-900 sm:inline">{session.name}</span>
                <svg
                  className={`hidden h-4 w-4 text-gray-400 transition-transform sm:inline ${profileOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {profileOpen && (
                <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-popover">
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  >
                    {ICONS.profile}
                    {t('nav_profile')}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                      />
                    </svg>
                    {t('nav_logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 animate-fade-in p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
