import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createOAuthClient, exchangeCodeForTokens, findOrCreateAttachmentsFolder } from '@/lib/google/drive-oauth';

function htmlPage(body: string, isError = false): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>Setup Google Drive</title>
      <style>
        body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#111827;}
        h1{font-size:20px;} .box{background:#f3f4f6;border-radius:8px;padding:16px;margin:12px 0;word-break:break-all;font-family:monospace;font-size:13px;}
        .label{font-weight:600;margin-top:20px;} .err{color:#b91c1c;background:#fef2f2;padding:12px;border-radius:8px;}
        .ok{color:#065f46;background:#ecfdf5;padding:12px;border-radius:8px;}
      </style>
    </head><body>${body}</body></html>`,
    { status: isError ? 500 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/**
 * Fase 9 — langkah 2 dari alur one-time setup OAuth Google Drive. Google redirect ke sini
 * setelah admin klik "Allow" di consent screen, membawa `code`. Kita tukar code itu jadi
 * access_token + refresh_token, lalu langsung dipakai untuk membuat folder tujuan upload
 * lampiran di Drive admin ("TMS Comment Attachments"). Hasil akhir (refresh_token + folder ID)
 * ditampilkan sebagai teks supaya admin bisa salin ke .env.local / Vercel Environment Variables
 * — TIDAK disimpan otomatis di mana pun oleh server (server ini stateless/serverless, tidak ada
 * tempat aman untuk menyimpannya sendiri selain env var yang di-set manual).
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const code = req.nextUrl.searchParams.get('code');
  const errorParam = req.nextUrl.searchParams.get('error');

  if (errorParam) {
    return htmlPage(`<h1>Setup dibatalkan</h1><p class="err">Google mengembalikan error: ${errorParam}</p>`, true);
  }
  if (!code) {
    return htmlPage(`<h1>Setup gagal</h1><p class="err">Tidak ada parameter "code" dari Google.</p>`, true);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return htmlPage(
        `<h1>Setup gagal</h1><p class="err">Google tidak mengirim refresh_token. Ini biasanya terjadi kalau akun ini SUDAH PERNAH menyetujui akses aplikasi ini sebelumnya. Buka
        <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>,
        cabut akses untuk aplikasi ini, lalu ulangi proses connect dari awal.</p>`,
        true
      );
    }

    const client = createOAuthClient();
    client.setCredentials(tokens);
    const folderId = await findOrCreateAttachmentsFolder(client);

    return htmlPage(`
      <h1>✅ Setup Google Drive berhasil</h1>
      <p class="ok">Folder "TMS Comment Attachments" sudah siap di Google Drive Anda. Salin DUA nilai di bawah ini ke <code>.env.local</code> (development) DAN ke Environment Variables project di Vercel (production), lalu redeploy.</p>

      <p class="label">GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN</p>
      <div class="box">${tokens.refresh_token}</div>

      <p class="label">GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID</p>
      <div class="box">${folderId}</div>

      <p style="margin-top:24px;color:#6b7280;font-size:13px;">Halaman ini boleh ditutup setelah kedua nilai di atas disalin. Refresh token ini tidak akan ditampilkan lagi oleh halaman ini — kalau hilang, ulangi proses connect dari awal.</p>
    `);
  } catch (e) {
    return htmlPage(`<h1>Setup gagal</h1><p class="err">${e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.'}</p>`, true);
  }
}
