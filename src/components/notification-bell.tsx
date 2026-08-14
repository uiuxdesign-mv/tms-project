'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useLanguage } from '@/components/language-provider';
import { usePolling } from '@/lib/hooks/use-polling';
import { useToast } from '@/components/toast-provider';

type NotificationItem = {
  id: string;
  type: string;
  task_id: string;
  task_title: string;
  actor_name: string;
  read_at: string;
  created_at: string;
};

/**
 * Bell notifikasi di header (permintaan user Round 5, poin 3 & 4) — diletakkan sebelah kiri
 * avatar di app-shell.tsx. Sumber datanya GET /api/notifications (lihat
 * src/lib/models/notifications.ts), di-poll berkala (usePolling, lihat use-polling.ts untuk
 * kenapa polling bukan WebSocket) supaya penunjukan tugas baru muncul TANPA user perlu refresh
 * halaman (poin 3) — termasuk toast sesaat begitu notifikasi baru terdeteksi lewat polling, dan
 * badge unread count di ikon bell. Teks notifikasi selalu diresolve lewat t() sesuai bahasa aktif
 * (ID/EN), bukan disimpan sebagai teks siap-tayang di server.
 */
export default function NotificationBell() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  // ID yang sudah pernah "dilihat" di sesi browser ini — dipakai supaya toast HANYA muncul untuk
  // notifikasi yang benar-benar baru terdeteksi lewat polling (bukan setiap kali polling
  // mengembalikan notifikasi lama yang belum sempat diklik).
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications');
      const json = await parseJsonSafe(res);
      if (!res.ok) return;
      const data: NotificationItem[] = json.data || [];

      if (initialized.current) {
        const freshlyUnread = data.filter((n) => !n.read_at && !seenIds.current.has(n.id));
        freshlyUnread.forEach((n) => toast.info(renderMessage(n, t)));
      }
      data.forEach((n) => seenIds.current.add(n.id));
      initialized.current = true;

      setItems(data);
      setUnreadCount(typeof json.unreadCount === 'number' ? json.unreadCount : 0);
    } catch {
      // Diam-diam gagal — ini fitur polling di background, jangan spam error ke user, coba lagi
      // di siklus polling berikutnya.
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePolling(load, 20_000);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleItemClick(n: NotificationItem) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
    if (n.task_id) router.push(`/tasks?task=${n.task_id}`);
  }

  async function handleMarkAllRead() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || now })));
    setUnreadCount(0);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      // Optimistic UI sudah terlanjur menandai semua terbaca di layar — kalau request-nya
      // ternyata gagal, polling berikutnya (20 detik lagi) akan mengoreksi otomatis dari data
      // server yang sesungguhnya, tidak perlu penanganan error khusus di sini.
    }
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('notif_bell_label')}
        aria-label={t('notif_bell_label')}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-lg border border-gray-200 bg-white shadow-popover">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-semibold text-gray-900">{t('notif_dropdown_title')}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                {t('notif_mark_all_read')}
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && <p className="px-3 py-4 text-center text-sm text-gray-400">{t('notif_loading')}</p>}
            {!loading && items.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-gray-400">{t('notif_empty')}</p>
            )}
            {!loading &&
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-gray-50 ${
                    !n.read_at ? 'bg-indigo-50/50' : ''
                  }`}
                >
                  <span className="flex items-start gap-1.5 text-gray-700">
                    {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />}
                    <span>{renderMessage(n, t)}</span>
                  </span>
                  <span className="pl-3 text-xs text-gray-400">{formatDate(n.created_at)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const NOTIF_MESSAGE_KEYS: Record<string, import('@/lib/i18n/translations').TranslationKey> = {
  task_assigned: 'notif_task_assigned',
  task_comment: 'notif_task_comment',
};

function renderMessage(n: NotificationItem, t: (key: import('@/lib/i18n/translations').TranslationKey) => string): string {
  const key = NOTIF_MESSAGE_KEYS[n.type];
  if (key) {
    return t(key).replace('{actor}', n.actor_name || '-').replace('{title}', n.task_title || '-');
  }
  return n.task_title || '';
}
