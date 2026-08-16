'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useLanguage } from '@/components/language-provider';
import { Badge } from '@/components/badge';
import type { TranslationKey, Lang } from '@/lib/i18n/translations';

/**
 * Activity Feed Terpadu (Redesign Modal Task Detail — Round 10, "Saran 4": Activity dengan Filter
 * & "Sembunyikan Riwayat Lama", direferensikan dari pola ClickUp). Komponen ini MENGGABUNGKAN
 * task-comments.tsx + task-history.tsx menjadi satu feed kronologis dengan filter
 * (Semua/Komentar/Perubahan) dan collapse aktivitas lama — TANPA menghilangkan satupun fitur dari
 * kedua komponen aslinya (permintaan eksplisit user): CRUD komentar (tambah/edit/hapus), upload &
 * render lampiran (gambar/video/file lain), badge "diedit", avatar inisial, gate readOnly, DAN
 * seluruh detail entri riwayat perubahan (label field ter-i18n, badge status, "diubah dari...
 * menjadi...").
 *
 * Data tetap diambil dari 2 endpoint terpisah yang sudah ada (tidak perlu endpoint backend baru —
 * penggabungan dilakukan di client, sesuai catatan efek "Saran 4" di
 * redesign-modal-round2-clickup.md: kerja backend TIDAK wajib kalau digabung di sisi client).
 */

type Attachment = { category: string; mimeType: string; originalName: string; fileSize: number };
type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  comment: string;
  attachment: Attachment | null;
  created_at: string;
  updated_at: string;
  edited: boolean;
};

type HistoryEntry = {
  id: string;
  task_id: string;
  change_type: 'field' | 'status';
  field_key: string;
  old_value_label: string;
  new_value_label: string;
  changed_by: string;
  changed_by_name: string;
  created_at: string;
};

type ActivityItem =
  | { kind: 'comment'; ts: string; comment: Comment }
  | { kind: 'history'; ts: string; history: HistoryEntry };

type ActivityFilter = 'all' | 'comments' | 'history';

// Sama persis dengan FIELD_LABEL_KEYS di task-history.tsx — dipertahankan apa adanya.
const FIELD_LABEL_KEYS: Record<string, TranslationKey> = {
  title: 'hist_field_title',
  description: 'hist_field_description',
  client_id: 'hist_field_client',
  project_id: 'hist_field_project',
  task_type_id: 'hist_field_task_type',
  priority_id: 'hist_field_priority',
  assigned_to: 'hist_field_assignee',
  due_date: 'hist_field_due_date',
  start_date: 'hist_field_start_date',
  estimated_hours: 'hist_field_est_hours',
  related_task_id: 'hist_field_related_task',
  status_id: 'col_status',
};

// Jumlah aktivitas terbaru yang selalu tampil; sisanya (lebih lama) disembunyikan di belakang
// tautan "Tampilkan N aktivitas lama" — inti dari Saran 4.
const VISIBLE_TAIL = 8;

// Perbaikan (permintaan user): picker emoji ringkas untuk kolom komentar — daftar tetap (tidak
// perlu library eksternal/koneksi internet), cukup untuk kebutuhan reaksi komentar sehari-hari.
const EMOJI_LIST = [
  '👍', '👎', '🙏', '😀', '😄', '😊',
  '😉', '😍', '🎉', '🙌', '👏', '🔥',
  '✅', '❌', '⚠️', '💯', '🚀', '👀',
  '💡', '❤️', '🤔', '⏰', '💪', '🎯',
];

/** Perbaikan (permintaan user): kolom avatar + garis penghubung yang dipakai SAMA di komentar
 *  maupun aktivitas perubahan, supaya feed-nya terlihat sebagai satu timeline yang menyambung
 *  (avatar item ini ke avatar item berikutnya) — bukan cuma di komentar seperti sebelumnya. Garis
 *  tidak dirender untuk item TERAKHIR (tidak ada lagi yang perlu disambung ke bawah). */
function ActivityAvatar({ initial, title, isLast }: { initial: string; title: string; isLast: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center self-stretch">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700"
        title={title}
      >
        {initial}
      </span>
      {!isLast && <div className="mt-1 w-px flex-1 bg-gray-200" aria-hidden="true" />}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Bugfix (permintaan user, "sesuaikan dengan konfigurasi bahasa"): sebelumnya locale format
// tanggal di sini SELALU 'id-ID' walau toggle bahasa aplikasi sudah di-set ke English — sekarang
// ikut parameter `lang` dari useLanguage(), konsisten dengan seluruh teks lain di feed ini.
function formatDate(iso: string, lang: Lang): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function TaskActivityFeed({
  taskId,
  currentUserId,
  canDeleteAny,
  readOnly = false,
  statuses,
}: {
  taskId: string;
  currentUserId: string;
  canDeleteAny: boolean;
  /** Sama seperti task-comments.tsx: task yang cuma boleh DILIHAT (view-only) tidak boleh
   *  berkomentar sama sekali — form tambah komentar disembunyikan total. */
  readOnly?: boolean;
  /** Perbaikan (permintaan user, badge status di aktivitas perubahan): daftar status + warnanya
   *  (Master Status, sama seperti dipakai <Badge> di tempat lain, mis. tasks-table.tsx) — dipakai
   *  untuk mewarnai badge status lama/baru di entri riwayat perubahan status. */
  statuses: { label: string; colorCode?: string | null }[];
}) {
  // ---- Komentar: state & logic identik dengan task-comments.tsx (tidak ada yang dihapus) ----
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Perbaikan (permintaan user): toggle picker emoji + ref untuk deteksi klik di luar (auto-close).
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Perbaikan (permintaan user): lampiran sekarang bisa diganti/dihapus lewat mode edit juga —
  // editFile = file baru yg dipilih (menggantikan lampiran lama), editRemoveAttachment = tandai
  // lampiran yang ADA untuk dihapus (tanpa diganti). Direset tiap kali mulai/batal edit.
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editRemoveAttachment, setEditRemoveAttachment] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // ---- Riwayat: state & logic identik dengan task-history.tsx ----
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ---- Filter & collapse aktivitas lama (baru, khusus Saran 4) ----
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [showOlder, setShowOlder] = useState(false);

  // Perbaikan (permintaan user): scroll list aktivitas defaultnya di BAWAH (aktivitas terbaru
  // langsung terlihat), bukan di atas seperti default browser — daftar disusun oldest-first jadi
  // yang terbaru selalu ada di paling bawah. `scrollToLatestTick` dipakai sbg "sinyal" generik:
  // tiap kali di-increment, layout effect di bawah men-scroll container ke paling bawah SETELAH
  // render (bukan pas trigger-nya, supaya DOM/tinggi konten sudah pasti ter-update dulu).
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const [scrollToLatestTick, setScrollToLatestTick] = useState(0);
  const scrollToLatest = useCallback(() => setScrollToLatestTick((v) => v + 1), []);

  const toast = useToast();
  const confirmDialog = useConfirm();
  const { t, lang } = useLanguage();

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments`);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_comments_load_failed'));
      setComments(json.data);
    } catch (e) {
      setCommentsError(e instanceof Error ? e.message : t('toast_comments_load_failed'));
    } finally {
      setCommentsLoading(false);
    }
  }, [taskId, t]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/history`);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_history_load_failed'));
      setHistory(json.data || []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : t('toast_history_load_failed'));
    } finally {
      setHistoryLoading(false);
    }
  }, [taskId, t]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Reset collapse tiap kali filter diganti — supaya angka "N aktivitas lama" selalu dihitung
  // ulang sesuai daftar yang sedang aktif, bukan state basi dari filter sebelumnya.
  useEffect(() => {
    setShowOlder(false);
  }, [filter]);

  // Perbaikan (permintaan user, picker emoji): tutup popover emoji kalau klik di luar area-nya.
  useEffect(() => {
    if (!emojiOpen) return;
    function onDocClick(e: MouseEvent) {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [emojiOpen]);

  // Perbaikan (permintaan user, badge status di aktivitas perubahan): peta label status -> warna
  // (Master Status) supaya badge status lama/baru di riwayat perubahan pakai warna yang sama
  // dengan badge Status di tempat lain (mis. tabel task, field Status di modal ini sendiri).
  const statusColorByLabel = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const s of statuses) map[s.label] = s.colorCode;
    return map;
  }, [statuses]);

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + emoji);
      setEmojiOpen(false);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) {
      setCommentsError(t('comment_empty_error'));
      return;
    }
    setSubmitting(true);
    setCommentsError(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append('comment', text);
        form.append('file', file);
        res = await apiFetch(`/api/tasks/${taskId}/comments`, { method: 'POST', body: form });
      } else {
        res = await apiFetch(`/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: text }),
        });
      }
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_comment_send_failed'));
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadComments();
      // Perbaikan (permintaan user, "keterkaitan"): komentar yang baru saja dikirim otomatis
      // ada di paling bawah (urutan oldest-first) — kalau tidak ikut di-scroll, komentar sendiri
      // yang baru dikirim bisa jadi tidak langsung terlihat kalau posisi scroll sebelumnya lagi
      // di atas. Konsisten dengan tujuan perbaikan ini: "default menampilkan yang terbaru".
      scrollToLatest();
      toast.success(t('toast_comment_sent'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('toast_comment_send_failed');
      setCommentsError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(c: Comment) {
    setEditingId(c.id);
    setEditText(c.comment);
    setEditFile(null);
    setEditRemoveAttachment(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditFile(null);
    setEditRemoveAttachment(false);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  }

  // Perbaikan (permintaan user): lampiran sekarang ikut bisa diganti/dihapus lewat edit —
  // sebelumnya cuma teks yang dikirim (JSON) dan lampiran lama tidak pernah disentuh sama sekali.
  // Kalau user cuma edit teks (tidak menyentuh lampiran), tetap kirim JSON polos seperti semula
  // supaya perilaku untuk kasus paling umum ini tidak berubah.
  async function saveEdit(c: Comment) {
    try {
      let res: Response;
      if (editFile) {
        const form = new FormData();
        form.append('comment', editText);
        form.append('file', editFile);
        res = await apiFetch(`/api/tasks/${taskId}/comments/${c.id}`, { method: 'PATCH', body: form });
      } else if (editRemoveAttachment && c.attachment) {
        const form = new FormData();
        form.append('comment', editText);
        form.append('removeAttachment', '1');
        res = await apiFetch(`/api/tasks/${taskId}/comments/${c.id}`, { method: 'PATCH', body: form });
      } else {
        res = await apiFetch(`/api/tasks/${taskId}/comments/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: editText }),
        });
      }
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_comment_save_failed'));
      cancelEdit();
      await loadComments();
      toast.success(t('toast_comment_updated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toast_comment_save_failed'));
    }
  }

  async function handleDelete(commentId: string) {
    const ok = await confirmDialog({ message: t('confirm_delete_comment_message'), confirmLabel: t('action_delete'), danger: true });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_comment_delete_failed'));
      await loadComments();
      toast.success(t('toast_comment_deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toast_comment_delete_failed'));
    }
  }

  function initialOf(name: string) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function fieldLabel(fieldKey: string): string {
    const key = FIELD_LABEL_KEYS[fieldKey];
    return key ? t(key) : fieldKey;
  }

  function valueLabel(v: string): string {
    return v ? v : t('hist_empty_value');
  }

  const merged = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [
      ...comments.map((c) => ({ kind: 'comment' as const, ts: c.created_at, comment: c })),
      ...history.map((h) => ({ kind: 'history' as const, ts: h.created_at, history: h })),
    ];
    // Oldest-first — konsisten dengan urutan asli comments/history sebelum digabung (lihat
    // getCommentsForTask/getHistoryForTask di server: "oldest-first sesuai spesifikasi").
    return items.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  }, [comments, history]);

  const filtered = useMemo(() => {
    if (filter === 'comments') return merged.filter((i) => i.kind === 'comment');
    if (filter === 'history') return merged.filter((i) => i.kind === 'history');
    return merged;
  }, [merged, filter]);

  const hiddenCount = Math.max(0, filtered.length - VISIBLE_TAIL);
  const visibleItems = showOlder || hiddenCount === 0 ? filtered : filtered.slice(hiddenCount);

  // Loading gabungan hanya kalau KEDUA sumber belum ada data sama sekali — kalau salah satu sudah
  // selesai lebih dulu, feed langsung tampil (tidak menunggu yang paling lambat).
  const loading = commentsLoading && historyLoading && merged.length === 0;

  // Perbaikan (permintaan user): scroll list aktivitas defaultnya di BAWAH (aktivitas terbaru
  // langsung terlihat), bukan di atas seperti default browser. Satu useLayoutEffect ini menangani
  // SEMUA pemicu sekaligus (langsung memanipulasi DOM ref, TANPA memanggil setState di dalam efek
  // — supaya bersih dari lint "set-state-in-effect"), lewat 3 dependency:
  //  - `loading`: begitu aktivitas pertama kali selesai dimuat (true -> false). Modal task selalu
  //    dibuka sebagai instance BARU per task (lihat `{editingId && <TaskDetailModal/>}` di
  //    tasks-table.tsx/kanban-board.tsx/calendar-view.tsx — tidak ada `key`, tapi modal SELALU
  //    unmount total dulu sebelum task lain dibuka), jadi `loading` otomatis true->false lagi
  //    dengan sendirinya tiap kali komponen ini di-mount ulang utk task berikutnya.
  //  - `filter`: ganti tab (Semua/Komentar/Perubahan) juga ikut ke bawah lagi — supaya "default
  //    menampilkan yang terbaru" konsisten utk tab manapun, bukan cuma tab "Semua" yg pertama
  //    dimuat.
  //  - `scrollToLatestTick`: pemicu manual dari luar efek (lihat handleSubmit — dipanggil dari
  //    event handler biasa, BUKAN dari dalam useEffect, jadi setState di dalamnya aman/tidak
  //    kena lint yg sama) — dipakai supaya komentar yang baru dikirim langsung ikut ke-scroll.
  // SENGAJA TIDAK ikut bereaksi ke `showOlder` (tombol "Tampilkan N aktivitas lama") — itu
  // menambah konten lama di ATAS; kalau ikut discroll ke bawah lagi jadi kontradiktif dgn maksud
  // tombolnya sendiri (baru diminta lihat yg lama, tapi langsung ke-scroll balik ke paling baru).
  useLayoutEffect(() => {
    const el = activityScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [loading, filter, scrollToLatestTick]);

  function renderCommentItem(c: Comment, isLast: boolean) {
    return (
      <li key={`c-${c.id}`} className="flex gap-3">
        <ActivityAvatar initial={initialOf(c.user_name)} title={c.user_name} isLast={isLast} />
        <div className="min-w-0 flex-1 pb-4">
          {/* Perbaikan (permintaan user): tanggal dipindah mentok kanan (justify-between),
              sebelumnya menempel langsung di sebelah nama. */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{c.user_name}</span>
              {c.edited && <span className="text-xs italic text-gray-400">{t('comments_edited_badge')}</span>}
            </div>
            <span className="shrink-0 text-xs text-gray-400">{formatDate(c.created_at, lang)}</span>
          </div>

          {editingId === c.id ? (
            <div className="mt-1 space-y-1.5">
              <div className="focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 rounded-lg border border-gray-300 bg-white transition-colors">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder={t('comment_placeholder')}
                  rows={2}
                  className="w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                />
                {/* Perbaikan (permintaan user): lampiran sekarang bisa diganti (icon attach ini)
                    atau dihapus (tombol ✕ di chip di bawah) selama edit — sebelumnya lampiran
                    sama sekali tidak bisa disentuh di mode edit. */}
                <div className="flex items-center gap-1 border-t border-gray-100 px-2 py-1.5">
                  <label
                    className="flex cursor-pointer items-center rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                    title={t('comment_attach_aria')}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setEditFile(f);
                        if (f) setEditRemoveAttachment(false);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {editFile ? (
                <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <span className="flex-1 truncate">{editFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditFile(null);
                      if (editFileInputRef.current) editFileInputRef.current.value = '';
                    }}
                    className="shrink-0 text-gray-400 hover:text-red-600"
                    aria-label={t('comment_remove_attachment_aria')}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : c.attachment && !editRemoveAttachment ? (
                <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <span className="flex-1 truncate">{c.attachment.originalName}</span>
                  <span className="shrink-0 text-gray-400">({formatSize(c.attachment.fileSize)})</span>
                  <button
                    type="button"
                    onClick={() => setEditRemoveAttachment(true)}
                    className="shrink-0 text-gray-400 hover:text-red-600"
                    aria-label={t('comment_remove_attachment_aria')}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : c.attachment && editRemoveAttachment ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  <span className="flex-1">{t('comment_attachment_will_be_removed')}</span>
                  <button
                    type="button"
                    onClick={() => setEditRemoveAttachment(false)}
                    className="shrink-0 font-medium text-red-700 hover:text-red-900"
                  >
                    {t('action_cancel')}
                  </button>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => saveEdit(c)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  {t('action_save')}
                </button>
                <button onClick={cancelEdit} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900">
                  {t('action_cancel')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {c.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{c.comment}</p>}

              {c.attachment && (
                <div className="mt-2">
                  {c.attachment.category === 'image' ? (
                    <a href={`/api/tasks/${taskId}/comments/${c.id}/attachment`} target="_blank" rel="noreferrer">
                      <img
                        src={`/api/tasks/${taskId}/comments/${c.id}/attachment`}
                        alt={c.attachment.originalName}
                        className="max-h-48 rounded-lg border border-gray-200 object-cover"
                      />
                    </a>
                  ) : c.attachment.category === 'video' ? (
                    <video
                      controls
                      preload="metadata"
                      className="max-h-56 max-w-full rounded-lg border border-gray-200"
                      src={`/api/tasks/${taskId}/comments/${c.id}/attachment`}
                    />
                  ) : (
                    <a
                      href={`/api/tasks/${taskId}/comments/${c.id}/attachment`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 hover:bg-gray-100"
                    >
                      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="max-w-[180px] truncate">{c.attachment.originalName}</span>
                      <span className="shrink-0 text-xs text-gray-400">({formatSize(c.attachment.fileSize)})</span>
                    </a>
                  )}
                </div>
              )}

              <div className="mt-1 flex items-center gap-3">
                {c.user_id === currentUserId && (
                  <button onClick={() => startEdit(c)} className="text-xs font-medium text-gray-500 hover:text-gray-900">
                    {t('action_edit')}
                  </button>
                )}
                {(c.user_id === currentUserId || canDeleteAny) && (
                  <button onClick={() => handleDelete(c.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                    {t('action_delete')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </li>
    );
  }

  function renderHistoryItem(h: HistoryEntry, isLast: boolean) {
    return (
      <li key={`h-${h.id}`} className="flex gap-3">
        <ActivityAvatar initial={initialOf(h.changed_by_name)} title={h.changed_by_name} isLast={isLast} />
        <div className="min-w-0 flex-1 pb-4 text-sm">
          {/* Perbaikan (permintaan user): tanggal dipindah mentok kanan, dan badge bulat "Status"
              (cuma label kategori, bukan nilainya) DIHAPUS — sudah tidak perlu karena nilai status
              lama/baru sekarang tampil sendiri sebagai badge berwarna di kalimat di bawah. */}
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-gray-900">{h.changed_by_name}</span>
            <span className="shrink-0 text-xs text-gray-400">{formatDate(h.created_at, lang)}</span>
          </div>

          {h.change_type === 'status' ? (
            // Perbaikan (permintaan user): nama status lama/baru ditampilkan sebagai badge
            // berwarna (pakai <Badge>, warna dari Master Status — sama seperti badge Status di
            // tempat lain), bukan lagi teks polos dalam tanda kutip.
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-gray-700">
              <span className="font-medium">{fieldLabel(h.field_key)}</span>
              <span>{t('history_changed_from')}</span>
              <Badge label={valueLabel(h.old_value_label)} color={statusColorByLabel[h.old_value_label]} />
              <span>{t('history_changed_to')}</span>
              <Badge label={valueLabel(h.new_value_label)} color={statusColorByLabel[h.new_value_label]} />
            </div>
          ) : (
            <p className="mt-0.5 text-gray-700">
              <span className="font-medium">{fieldLabel(h.field_key)}</span>{' '}
              {t('history_changed_from')} &quot;{valueLabel(h.old_value_label)}&quot; {t('history_changed_to')} &quot;
              {valueLabel(h.new_value_label)}&quot;
            </p>
          )}
        </div>
      </li>
    );
  }

  return (
    // Permintaan user (redesign lanjutan): kartu Activity ini sekarang mengisi PENUH tinggi kolom
    // kanan (dari atas sampai bawah, sejajar kolom kiri) di layar besar — bukan lagi cuma
    // se-tinggi kontennya dengan sisa ruang kosong di bawah. "lg:h-full" & "flex flex-col" DIBATASI
    // ke breakpoint lg supaya perilaku mobile (yang belum pernah diminta berubah) tetap sama persis
    // seperti sebelumnya.
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 lg:h-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('activity_heading')} <span className="font-normal text-gray-400">({merged.length})</span>
        </h3>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1" role="group" aria-label={t('activity_filter_aria')}>
          {(['all', 'comments', 'history'] as ActivityFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {f === 'all' ? t('activity_filter_all') : f === 'comments' ? t('activity_filter_comments') : t('activity_filter_history')}
            </button>
          ))}
        </div>
      </div>

      {commentsError && <div className="mb-2 shrink-0 rounded-lg bg-red-50 p-2 text-xs text-red-700">{commentsError}</div>}
      {historyError && <div className="mb-2 shrink-0 rounded-lg bg-red-50 p-2 text-xs text-red-700">{historyError}</div>}

      <div ref={activityScrollRef} className="max-h-80 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {loading && <p className="py-2 text-sm text-gray-400">{t('activity_loading')}</p>}
        {!loading && filtered.length === 0 && <p className="py-2 text-sm text-gray-400">{t('activity_empty')}</p>}

        {!loading && filtered.length > 0 && (
          // Perbaikan (permintaan user, garis penghubung avatar): spacing antar item sebelumnya
          // pakai "space-y-4" di <ul> — sekarang dipindah jadi "pb-4" di masing-masing item (lihat
          // ActivityAvatar) supaya kolom avatar tiap <li> stretch pas 1 baris penuh (avatar+garis),
          // dan garisnya menyambung mulus ke avatar item berikutnya tanpa celah.
          <ul>
            {hiddenCount > 0 && (
              <li className="pb-3">
                {showOlder ? (
                  <button
                    type="button"
                    onClick={() => setShowOlder(false)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-900"
                  >
                    {t('activity_hide_older')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowOlder(true)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {t('activity_show_older').replace('{n}', String(hiddenCount))}
                  </button>
                )}
              </li>
            )}

            {visibleItems.map((item, idx) => {
              const isLast = idx === visibleItems.length - 1;
              return item.kind === 'comment' ? renderCommentItem(item.comment, isLast) : renderHistoryItem(item.history, isLast);
            })}
          </ul>
        )}
      </div>

      {!readOnly && (
        <form onSubmit={handleSubmit} className="mt-3 shrink-0 border-t border-gray-100 pt-3">
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              <span className="flex-1 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="shrink-0 text-gray-400 hover:text-red-600"
                aria-label={t('comment_remove_attachment_aria')}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Perbaikan (permintaan user): tombol Kirim dipindah ke SAMPING KANAN field komentar
              (bukan lagi di bawah). Icon attachment + emoji sekarang MASUK ke dalam "field" —
              wrapper bordered ini yang jadi field-nya (textarea di dalamnya tanpa border sendiri),
              icon-icon ditaruh di baris toolbar bawah tapi masih di DALAM garis border yang sama,
              supaya secara visual keduanya kelihatan menyatu dengan field, bukan terpisah. */}
          <div className="flex items-end gap-2">
            <div className="focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 flex-1 rounded-lg border border-gray-300 bg-white transition-colors">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder={t('comment_placeholder')}
                className="w-full resize-none rounded-t-lg border-0 bg-transparent px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
              />
              <div className="relative flex items-center gap-1 border-t border-gray-100 px-2 py-1.5">
                <label
                  className="flex cursor-pointer items-center rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                  title={t('comment_attach_aria')}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>

                <div ref={emojiWrapRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    className="flex items-center rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                    title={t('comment_emoji_aria')}
                    aria-label={t('comment_emoji_aria')}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
                      />
                    </svg>
                  </button>

                  {emojiOpen && (
                    <div className="absolute bottom-full left-0 z-10 mb-2 grid w-56 grid-cols-6 gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                      {EMOJI_LIST.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => insertEmoji(em)}
                          className="rounded-md p-1 text-lg leading-none hover:bg-gray-100"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? t('comment_sending') : t('comment_send')}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-400">{t('comment_hint')}</p>
        </form>
      )}
    </div>
  );
}
