/**
 * Deteksi tipe file dari ISI (magic bytes), BUKAN dari nama file yang diupload — meniru
 * requirement aplikasi lama ("mime_type hasil sniff server-side... mencegah smuggle .php").
 *
 * Catatan arsitektur: di aplikasi lama, risiko utama smuggle adalah file berbahaya ditaruh di
 * folder `uploads/` yang bisa diakses langsung sebagai URL statis (kalau web server salah
 * konfigurasi, `.php` di situ bisa tereksekusi). Di rebuild ini, lampiran TIDAK PERNAH disajikan
 * sebagai file statis — selalu lewat proxy download server (lihat
 * /api/tasks/[id]/comments/[commentId]/attachment) yang mengecek permission dan mengirim body
 * apa adanya dengan header Content-Disposition: attachment. Jadi kelas serangan "upload .php,
 * akses langsung, tereksekusi" itu sendiri sudah tidak mungkin terjadi di sini. Sniffing tetap
 * dipertahankan untuk: (a) kategorisasi Image/Video/File yang akurat (menentukan limit ukuran
 * mana yang berlaku), (b) defense-in-depth, (c) parity fungsional dengan aplikasi lama.
 */

export type AttachmentCategory = 'image' | 'video' | 'file';

export type SniffResult = { mime: string; category: AttachmentCategory };

function matchesBytes(buf: Buffer, offset: number, bytes: number[]): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function asciiAt(buf: Buffer, offset: number, len: number): string {
  if (buf.length < offset + len) return '';
  return buf.toString('ascii', offset, offset + len);
}

const IMAGE_ALLOWLIST = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_ALLOWLIST = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const FILE_ALLOWLIST = ['application/pdf', 'application/zip', 'text/plain'];

/** Sniff magic bytes; return null kalau tidak dikenali sama sekali (harus ditolak oleh caller). */
export function sniffMimeType(buf: Buffer): SniffResult | null {
  // --- Gambar ---
  if (matchesBytes(buf, 0, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', category: 'image' };
  if (matchesBytes(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', category: 'image' };
  if (asciiAt(buf, 0, 4) === 'GIF8') return { mime: 'image/gif', category: 'image' };
  if (asciiAt(buf, 0, 4) === 'RIFF' && asciiAt(buf, 8, 4) === 'WEBP') return { mime: 'image/webp', category: 'image' };

  // --- Video (ISO base media "ftyp" box dipakai mp4/mov/m4v; webm/mkv pakai signature EBML) ---
  if (asciiAt(buf, 4, 4) === 'ftyp') {
    const brand = asciiAt(buf, 8, 4).trim().toLowerCase();
    if (brand.startsWith('qt')) return { mime: 'video/quicktime', category: 'video' };
    return { mime: 'video/mp4', category: 'video' };
  }
  if (matchesBytes(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: 'video/webm', category: 'video' };
  if (asciiAt(buf, 0, 4) === 'RIFF' && asciiAt(buf, 8, 4) === 'AVI ') return { mime: 'video/x-msvideo', category: 'video' };

  // --- Dokumen ---
  if (asciiAt(buf, 0, 4) === '%PDF') return { mime: 'application/pdf', category: 'file' };
  // ZIP-based (docx/xlsx/pptx/zip biasa) — magic "PK\x03\x04" (atau varian empty-archive "PK\x05\x06").
  if (matchesBytes(buf, 0, [0x50, 0x4b, 0x03, 0x04]) || matchesBytes(buf, 0, [0x50, 0x4b, 0x05, 0x06])) {
    return { mime: 'application/zip', category: 'file' };
  }

  // --- Teks polos (fallback terakhir — hanya kalau isinya benar2 valid UTF-8 printable) ---
  const sample = buf.subarray(0, Math.min(buf.length, 2048));
  if (isLikelyPlainText(sample)) return { mime: 'text/plain', category: 'file' };

  return null; // tidak dikenali -> ditolak
}

function isLikelyPlainText(sample: Buffer): boolean {
  if (sample.length === 0) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128) printable++;
    if (byte === 0) return false; // null byte -> biner, bukan teks
  }
  return printable / sample.length > 0.95;
}

export const ALLOWED_MIME_TYPES = new Set([...IMAGE_ALLOWLIST, ...VIDEO_ALLOWLIST, ...FILE_ALLOWLIST]);

export const SIZE_LIMITS_BYTES: Record<AttachmentCategory, number> = {
  image: 5 * 1024 * 1024, // 5MB
  video: 25 * 1024 * 1024, // 25MB
  file: 10 * 1024 * 1024, // 10MB
};
