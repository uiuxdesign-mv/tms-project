import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

/**
 * Fase 9 (Comments + Lampiran): berbeda dari src/lib/google/client.ts (service account, dipakai
 * untuk Sheets), modul ini pakai OAuth2 ke akun Google PRIBADI pemilik aplikasi.
 *
 * Kenapa OAuth, bukan service account? Service account yang dipakai untuk Sheets punya kuota
 * penyimpanan Drive 0 (sudah terbukti 2x — waktu bikin sheet Audit Log di Fase 6 dan Task Time
 * Log di Fase 8, service account tidak bisa membuat file APAPUN baru, harus manusia yang buat
 * manual). Untuk lampiran komentar, aplikasi perlu membuat file BARU secara dinamis setiap kali
 * ada yang upload — tidak mungkin manusia buatkan manual satu-satu. Solusinya: OAuth ke akun
 * pribadi pemilik aplikasi (scope `drive.file`, terbatas hanya ke file yang dibuat aplikasi ini
 * sendiri), supaya file lampiran numpang di kuota Drive pribadi (15GB gratis), bukan kuota
 * service account (yang 0).
 *
 * Alur one-time setup ada di /api/auth/google-drive/connect + /callback (admin-only) — hasilnya
 * sebuah refresh_token yang disimpan sebagai env var GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN. Refresh
 * token ini dipakai terus-menerus untuk mendapatkan access_token baru tiap kali dibutuhkan
 * (access_token sendiri hanya berlaku ~1 jam, tidak disimpan).
 */

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} belum diset.`);
  }
  return value;
}

function getRedirectUri(): string {
  // Boleh di-override eksplisit (mis. kalau domain Vercel custom), tapi default ikut env yang
  // sudah ada supaya tidak perlu env var baru untuk kasus umum.
  const explicit = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;

  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (site) {
    const base = site.startsWith('http') ? site : `https://${site}`;
    return `${base}/api/auth/google-drive/callback`;
  }
  return 'http://localhost:3311/api/auth/google-drive/callback';
}

/** OAuth2Client "kosong" (belum ada token) — dipakai untuk membuat consent URL & tukar code. */
export function createOAuthClient(): OAuth2Client {
  const clientId = requireEnv('GOOGLE_DRIVE_OAUTH_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET');
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function getConsentUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // wajib supaya dapat refresh_token, bukan cuma access_token
    prompt: 'consent', // paksa selalu tampilkan consent screen, supaya refresh_token selalu ikut dikirim
    scope: DRIVE_SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

let cachedClient: OAuth2Client | null = null;

/** OAuth2Client siap pakai (sudah terisi refresh_token dari env var). */
function getAuthorizedClient(): OAuth2Client {
  if (cachedClient) return cachedClient;
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: requireEnv('GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN') });
  cachedClient = client;
  return client;
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuthorizedClient() });
}

/** Folder tujuan upload lampiran — dibuat sekali lewat alur connect, ID-nya disimpan di env var. */
function getAttachmentsFolderId(): string {
  return requireEnv('GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID');
}

/** Cari folder "TMS Comment Attachments" milik akun ini; buat kalau belum ada. Dipakai sekali saat alur connect. */
export async function findOrCreateAttachmentsFolder(client: OAuth2Client): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: client });
  const existing = await drive.files.list({
    q: "name = 'TMS Comment Attachments' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  const found = existing.data.files?.[0];
  if (found?.id) return found.id;

  const created = await drive.files.create({
    requestBody: { name: 'TMS Comment Attachments', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  if (!created.data.id) throw new Error('Gagal membuat folder lampiran di Drive.');
  return created.data.id;
}

export type UploadedAttachment = { driveFileId: string; fileSize: number };

/** Upload buffer file ke folder lampiran, return Drive file ID. */
export async function uploadAttachment(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<UploadedAttachment> {
  const drive = getDriveClient();
  const { Readable } = await import('stream');

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [getAttachmentsFolderId()] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, size',
  });

  if (!res.data.id) throw new Error('Gagal upload lampiran ke Google Drive.');
  return { driveFileId: res.data.id, fileSize: Number(res.data.size) || buffer.length };
}

/** Download isi file lampiran dari Drive (dipakai proxy download route, bukan link publik). */
export async function downloadAttachment(driveFileId: string): Promise<Buffer> {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/** Hapus file lampiran dari Drive (dipakai saat comment dengan lampiran dihapus permanen — belum dipakai untuk soft-delete). */
export async function deleteAttachment(driveFileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId: driveFileId }).catch(() => undefined); // best-effort, jangan gagalkan alur utama
}
