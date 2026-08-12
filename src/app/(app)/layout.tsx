import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { getVisibleMenuKeys } from '@/lib/menu-access/permissions';
import { MASTER_MENU_KEYS } from '@/lib/menu-access/config';
import AppShell, { type ShellNavGroup, type ShellNavLink } from '@/components/app-shell';
import * as SheetTable from '@/lib/google/sheet-table';

/**
 * Layout persisten (Fase 10) untuk semua halaman setelah login — sidebar + topbar dihitung SEKALI
 * di sini dari sesi & Menu Access, lalu dikirim ke AppShell (client component) yang menangani
 * highlight menu aktif & interaksi (collapse/mobile toggle). Sebelumnya tiap halaman membangun
 * headernya sendiri-sendiri ("← Kembali ke Dashboard" berulang di 9 halaman) — sekarang cukup di
 * satu tempat, dan navigasi antar halaman dalam grup ini tidak me-remount shell (persisten
 * sungguhan, bukan cuma visual mirip).
 *
 * proxy.ts sudah menjamin redirect ke /login kalau belum ada sesi untuk SEMUA halaman non-API —
 * pengecekan session di sini adalah lapisan kedua (defense-in-depth) sekaligus untuk membaca data
 * sesi yang dipakai membangun nav.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  const isAdmin = session.roleKey === 'admin';
  const visibleKeys = await getVisibleMenuKeys(session);
  const visibleMasterMenus = MASTER_MENU_KEYS.filter((m) => visibleKeys.has(m.key));

  const navGroups: ShellNavGroup[] = [
    { key: 'dashboard', label: 'Dashboard', labelKey: 'nav_dashboard', href: '/dashboard' },
  ];

  if (visibleKeys.has('tasking')) {
    // Sesuai video aplikasi lama: sidebar cuma punya SATU item "Tasks" (bukan grup collapsible
    // dengan anak List/Kanban/Calendar) — ketiga tampilan itu di-switch lewat tab di dalam
    // halaman /tasks sendiri (lihat TasksViewSwitcher), bukan lewat submenu sidebar.
    navGroups.push({ key: 'tasking', label: 'Tasks', labelKey: 'nav_tasking', href: '/tasks' });
  }

  if (visibleKeys.has('report')) {
    navGroups.push({ key: 'report', label: 'Report', labelKey: 'nav_report', href: '/reports' });
  }

  // Fase 12: sesuai video, sidebar cuma punya SATU grup "Master Data" yang menampung Master User,
  // ketujuh entity master data generik, dan Menu Access sekaligus — sebelumnya Master User &
  // Menu Access ada di grup terpisah "Administrasi" yang tidak muncul di video sama sekali.
  const masterDataLinks: ShellNavLink[] = [];
  if (isAdmin) {
    masterDataLinks.push({ key: 'master-users', label: 'Users', labelKey: 'nav_master_users', href: '/master/users' });
  }
  masterDataLinks.push(
    // Nama entity (Clients, Projects, dst.) dibangun dinamis dari config Menu Access dan TIDAK
    // punya translation key — di luar cakupan i18n Fase 10 (lihat catatan di translations.ts).
    ...visibleMasterMenus.map((m) => ({
      key: m.key,
      label: m.label.replace(/^Master /, ''),
      href: m.href,
    }))
  );
  if (isAdmin) {
    masterDataLinks.push({ key: 'menu-access', label: 'Menu Access', labelKey: 'nav_menu_access', href: '/master/menu-access' });
  }

  if (masterDataLinks.length > 0) {
    navGroups.push({
      key: 'master-data',
      label: 'Master Data',
      labelKey: 'nav_master_data',
      links: masterDataLinks,
    });
  }

  // Audit Log (Fase 12): tidak ada di sidebar video sama sekali — disembunyikan dari navigasi,
  // tapi rute /audit-log tetap bisa diakses langsung lewat URL untuk admin (tidak dihapus).
  // Profil Saya juga tidak ada di sidebar video — sudah bisa diakses lewat dropdown user di
  // topbar (lihat app-shell.tsx), jadi tidak perlu didobel di sini.

  // Foto profil (Fase 11) — di-fetch sekali di sini (bukan dari JWT session, yang tidak menyimpan
  // photo_url) supaya avatar di topbar langsung terlihat tanpa perlu logout/login setelah admin
  // mengganti foto lewat Master User atau user sendiri lewat Profile.
  const userRow = await SheetTable.findById('users', session.userId);
  const photoUrl = userRow?.photo_url ? `/api/users/${session.userId}/photo` : undefined;

  return (
    <AppShell
      session={{ name: session.name, email: session.email, roleName: session.roleName, photoUrl }}
      navGroups={navGroups}
    >
      {children}
    </AppShell>
  );
}
