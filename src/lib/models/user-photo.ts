import { uploadAttachment, deleteAttachment } from '@/lib/google/drive-oauth';
import { sniffMimeType } from '@/lib/mime-sniff';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB, sesuai helper text video: "JPG, PNG, or WEBP. Max 2MB."
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export type PhotoUploadResult = { ok: true; driveFileId: string } | { ok: false; error: string };

/** Upload foto profil (Master User Add/Edit) ke folder Drive yang sama dengan lampiran komentar. */
export async function uploadUserPhoto(buffer: Buffer, originalName: string): Promise<PhotoUploadResult> {
  if (buffer.length > MAX_PHOTO_BYTES) {
    return { ok: false, error: 'Ukuran foto terlalu besar. Maksimal 2MB.' };
  }
  const sniffed = sniffMimeType(buffer);
  if (!sniffed || !ALLOWED_IMAGE_MIME.has(sniffed.mime)) {
    return { ok: false, error: 'Jenis file tidak didukung. Gunakan JPG, PNG, GIF, atau WEBP.' };
  }
  try {
    const uploaded = await uploadAttachment(buffer, sniffed.mime, originalName);
    return { ok: true, driveFileId: uploaded.driveFileId };
  } catch (e) {
    throw e instanceof Error && /belum diset/.test(e.message)
      ? new Error('Penyimpanan foto (Google Drive) belum dikonfigurasi di server ini. Hubungi admin.')
      : new Error('Gagal upload foto ke Google Drive.');
  }
}

/** Hapus foto lama dari Drive (best-effort, dipanggil saat foto diganti/dihapus). */
export async function deleteUserPhoto(driveFileId: string): Promise<void> {
  if (!driveFileId) return;
  await deleteAttachment(driveFileId);
}

/** Ambil field `photo` dari FormData request (kalau ada), sudah dalam bentuk Buffer siap upload. */
export async function extractPhotoFile(form: FormData): Promise<{ buffer: Buffer; originalName: string } | null> {
  const uploaded = form.get('photo');
  if (!(uploaded instanceof File) || uploaded.size === 0) return null;
  const arrayBuffer = await uploaded.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), originalName: uploaded.name || 'foto.jpg' };
}
