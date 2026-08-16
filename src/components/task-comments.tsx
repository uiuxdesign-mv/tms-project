'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch, parseJsonSafe } from '@/lib/csrf-client';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { useLanguage } from '@/components/language-provider';

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function TaskComments({
  taskId,
  currentUserId,
  canDeleteAny,
  readOnly = false,
}: {
  taskId: string;
  currentUserId: string;
  canDeleteAny: boolean;
  /** Bugfix (permintaan user, fitur Leader Role): task yang cuma boleh DILIHAT (view-only, mis.
   *  Pemimpin/Manager membuka task user lain) tidak boleh berkomentar sama sekali — form tambah
   *  komentar disembunyikan total, bukan cuma dikira gagal lewat toast error setelah dicoba. */
  readOnly?: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const toast = useToast();
  const confirmDialog = useConfirm();
  const { t } = useLanguage();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments`);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_comments_load_failed'));
      setComments(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast_comments_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [taskId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) {
      setError(t('comment_empty_error'));
      return;
    }
    setSubmitting(true);
    setError(null);
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
      await load();
      toast.success(t('toast_comment_sent'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('toast_comment_send_failed');
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(c: Comment) {
    setEditingId(c.id);
    setEditText(c.comment);
  }

  async function saveEdit(commentId: string) {
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: editText }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json.error || t('toast_comment_save_failed'));
      setEditingId(null);
      await load();
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
      await load();
      toast.success(t('toast_comment_deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toast_comment_delete_failed'));
    }
  }

  function initialOf(name: string) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        {t('comments_heading')} <span className="font-normal text-gray-400">({comments.length})</span>
      </h3>

      {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      <div className="max-h-64 overflow-y-auto">
        {loading && <p className="py-2 text-sm text-gray-400">{t('comments_loading')}</p>}
        {!loading && comments.length === 0 && <p className="py-2 text-sm text-gray-400">{t('comments_empty')}</p>}
        {!loading && comments.length > 0 && (
          <ul className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700"
                  title={c.user_name}
                >
                  {initialOf(c.user_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{c.user_name}</span>
                    <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                    {c.edited && <span className="text-xs italic text-gray-400">{t('comments_edited_badge')}</span>}
                  </div>

                  {editingId === c.id ? (
                    <div className="mt-1 space-y-1.5">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder={t('comment_placeholder')}
                        rows={2}
                        className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(c.id)}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                        >
                          {t('action_save')}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900"
                        >
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
                              <span className="max-w-[11.25rem] truncate">{c.attachment.originalName}</span>
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
            ))}
          </ul>
        )}
      </div>

      {!readOnly && (
      <form onSubmit={handleSubmit} className="mt-3 border-t border-gray-100 pt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={t('comment_placeholder')}
          className="focus-ring w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors"
        />

        {file && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
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

        <div className="mt-2 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900">
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
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
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
