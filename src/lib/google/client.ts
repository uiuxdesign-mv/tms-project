import { google } from 'googleapis';
import type { Auth } from 'googleapis';

let cachedAuthClient: Auth.GoogleAuth | null = null;

/**
 * Membuat (dan meng-cache) Google Auth client dari service account key
 * yang disimpan di environment variable GOOGLE_SERVICE_ACCOUNT_KEY (isinya JSON lengkap, sebagai string).
 *
 * PENTING: jangan pernah commit file key JSON ke git. Simpan sebagai
 * environment variable di Vercel (Project Settings > Environment Variables).
 */
function getAuth(): Auth.GoogleAuth {
  if (cachedAuthClient) return cachedAuthClient;

  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY belum diset. Isi .env.local (development) atau Environment Variables di Vercel (production) dengan isi file JSON service account.'
    );
  }

  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(rawKey);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY tidak valid JSON.');
  }

  cachedAuthClient = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });

  return cachedAuthClient;
}

export async function getSheetsClient() {
  const auth = getAuth();
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient as never });
}
