'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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
  session: { name: string; email: string; roleName: string };
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

export default function AppShell({ session, navGroups, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Grup yang lagi collapsed disimpan sebagai Set of key yang DITUTUP (default semua grup dengan anak aktif otomatis terbuka).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <Link
        href="/dashboard"
        onClick={() => setMobileOpen(false)}
        className="mb-3 flex items-center gap-2 px-2 py-1.5 text-base font-semibold text-gray-900"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-900 text-sm text-white">T</span>
        TMS
      </Link>

      {navGroups.map((group) => {
        if (group.href) {
          const active = isActive(pathname, group.href);
          return (
            <Link
              key={group.key}
              href={group.href}
              onClick={() => setMobileOpen(false)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                active ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {resolveLabel(t, group)}
            </Link>
          );
        }

        const links = group.links || [];
        if (links.length === 0) return null;
        const hasActiveChild = groupHasActiveChild(pathname, group);
        const collapsed = collapsedGroups.has(group.key) && !hasActiveChild;

        return (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium ${
                hasActiveChild ? 'text-gray-900' : 'text-gray-500'
              } hover:bg-gray-100`}
            >
              <span>{resolveLabel(t, group)}</span>
              <span className={`text-xs transition-transform ${collapsed ? '' : 'rotate-90'}`}>›</span>
            </button>
            {!collapsed && (
              <div className="ml-2 flex flex-col gap-0.5 border-l border-gray-200 pl-3">
                {links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.key}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`rounded-md px-3 py-1.5 text-sm ${
                        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
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
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white md:block print:hidden">{sidebarContent}</aside>

      {/* Sidebar — mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-gray-200 bg-white shadow-lg">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 print:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md border border-gray-300 p-1.5 text-gray-600 md:hidden"
              aria-label={t('nav_open_menu')}
            >
              ☰
            </button>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md border border-gray-300 p-1.5 text-sm text-gray-600 hover:bg-gray-50"
              aria-label={theme === 'dark' ? t('theme_to_light') : t('theme_to_dark')}
              title={theme === 'dark' ? t('theme_to_light') : t('theme_to_dark')}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              type="button"
              onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              aria-label={t('lang_switch')}
              title={t('lang_switch')}
            >
              {lang === 'id' ? 'EN' : 'ID'}
            </button>
            <Link href="/profile" className="text-right text-sm text-gray-600 hover:text-gray-900">
              <span className="block font-medium text-gray-900">{session.name}</span>
              <span className="block text-xs text-gray-500">{session.roleName}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('nav_logout')}
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
