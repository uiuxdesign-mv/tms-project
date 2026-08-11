'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/csrf-client';

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
}: {
  taskId: string;
  currentUserId: string;
  canDeleteAny: boolean;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memuat komentar.');
      setComments(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat komentar.');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) {
      setError('Komentar harus berisi teks atau lampiran file.');
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengirim komentar.');
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim komentar.');
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan perubahan.');
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan perubahan.');
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm('Hapus komentar ini?')) return;
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menghapus komentar.');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menghapus komentar.');
    }
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Komentar</h3>

      {error && <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      <div className="max-h-64 space-y-3 overflow-y-auto">
        {loading && <p className="text-xs text-gray-400">Memuat komentar...</p>}
        {!loading && comments.length === 0 && <p className="text-xs text-gray-400">Belum ada komentar.</p>}
        {!loading &&
          comments.map((c) => (
            <div key={c.id} className="rounded-md border border-gray-100 bg-gray-50 p-2.5 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-gray-800">{c.user_name}</span>
                <span className="text-[11px] text-gray-400">
                  {formatDate(c.created_at)}
                  {c.edited && ' (edited)'}
                </span>
              </div>

              {editingId === c.id ? (
                <div className="space-y-1.5">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(c.id)}
                      className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800"
                    >
                      Simpan
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {c.comment && <p className="whitespace-pre-wrap text-gray-700">{c.comment}</p>}

                  {c.attachment && (
                    <div className="mt-1.5">
                      {c.attachment.category === 'image' ? (
                        <a
                          href={`/api/tasks/${taskId}/comments/${c.id}/attachment`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={`/api/tasks/${taskId}/comments/${c.id}/attachment`}
                            alt={c.attachment.originalName}
                            className="max-h-40 rounded-md border border-gray-200"
                          />
                        </a>
                      ) : c.attachment.category === 'video' ? (
                        <video
                          controls
                          className="max-h-48 rounded-md border border-gray-200"
                          src={`/api/tasks/${taskId}/comments/${c.id}/attachment`}
                        />
                      ) : (
                        <a
                          href={`/api/tasks/${taskId}/comments/${c.id}/attachment`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 underline"
                        >
                          📎 {c.attachment.originalName} ({formatSize(c.attachment.fileSize)})
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-1 flex gap-3">
                    {c.user_id === currentUserId && (
                      <button onClick={() => startEdit(c)} className="text-[11px] text-gray-500 hover:text-gray-800">
                        Edit
                      </button>
                    )}
                    {(c.user_id === currentUserId || canDeleteAny) && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-[11px] text-red-500 hover:text-red-700"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Tulis komentar..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-xs text-gray-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? 'Mengirim...' : 'Kirim'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">Maks 1 lampiran per komentar — Gambar 5MB, Video 25MB, File lain 10MB.</p>
      </form>
    </div>
  );
}
