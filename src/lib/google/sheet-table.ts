import { randomUUID } from 'crypto';
import { getSheetsClient } from './client';
import { SPREADSHEET_IDS, type SheetKey } from './spreadsheet-ids';
import { getCached, setCached, invalidateCache } from './cache';

const CACHE_TTL_MS = 30_000; // 30 detik

export type SheetRow = Record<string, string>;

function columnLetter(n: number): string {
  let s = '';
  let num = n;
  while (num > 0) {
    const m = (num - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    num = Math.floor((num - m) / 26);
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bugfix (Fase 19, DIPERKUAT — permintaan user, item reliability): sejak beberapa endpoint
 * Task/Time Tracking melewati cache in-memory demi konsistensi (lihat komentar di route GET
 * /api/tasks dkk), pembacaan sheet lewat di sini jadi jauh lebih sering langsung memanggil
 * Google Sheets API — sesekali kena error transient (rate limit 429, atau 5xx sesaat dari
 * Google) yang SEBELUMNYA jarang terlihat karena "diredam" oleh cache. Tanpa retry, error
 * transient begini bikin request gagal total (500 kosong ke client, padahal cuma butuh dicoba
 * ulang sebentar) — jadi di-retry beberapa kali sebelum benar-benar dianggap gagal.
 *
 * Diperkuat lagi (permintaan user: error "Gagal memuat data/opsi Task" masih sering muncul di
 * produksi dengan beberapa user bersamaan) — kuota Google Sheets API adalah PER MENIT (300
 * read/menit per project, 60/menit per akun service, lihat cache.ts), jadi begitu kena 429
 * jeda beberapa ratus milidetik saja sering TIDAK CUKUP untuk quota window-nya reset. Sekarang:
 * lebih banyak percobaan (5x), jeda dasar lebih panjang untuk 429 spesifik, plus jitter acak
 * supaya banyak request yang kena limit bersamaan tidak semuanya retry di detik yang sama persis
 * (thundering herd).
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = Number((err as { code?: number | string; status?: number })?.code ?? (err as { status?: number })?.status);
      // Transient: rate limit (429), error server Google (5xx), atau error tanpa kode HTTP sama
      // sekali (biasanya masalah jaringan sesaat) — selain itu (mis. 400/403 karena sheet memang
      // salah setting) tidak ada gunanya diulang, langsung lempar supaya pesan error tetap jelas.
      const isRateLimit = code === 429;
      const transient = isRateLimit || (code >= 500 && code < 600) || Number.isNaN(code);
      if (!transient || i === attempts - 1) throw err;
      const base = isRateLimit ? 800 : 300; // 429 butuh jeda lebih panjang daripada 5xx/network hiccup biasa
      const jitter = Math.random() * base * 0.5;
      await sleep(base * 2 ** i + jitter);
    }
  }
  throw lastErr;
}

// Perbaikan (permintaan user, item optimasi loading & rate limit): request de-duplication
// ("single-flight") — kalau beberapa request BERSAMAAN (dalam instance server yang sama) minta
// sheet yang sama persis sebelum panggilan pertama selesai, mereka semua "menumpang" 1 panggilan
// API yang sama, bukan masing-masing memicu panggilan Google Sheets API sendiri-sendiri. Ini
// aman dipakai walau untuk pembacaan yang sengaja bypass cache (useCache:false) — permintaan yang
// datang dalam rentang milidetik yang sama toh akan mendapat data yang praktis sama "segar"-nya,
// tapi bisa memangkas drastis jumlah panggilan API saat banyak user membuka halaman yang sama
// dalam waktu berdekatan (skenario paling umum penyebab rate limit 429 di produksi).
const inFlightReads = new Map<SheetKey, Promise<{ header: string[]; rows: string[][] }>>();

async function readHeaderAndRows(sheetKey: SheetKey): Promise<{ header: string[]; rows: string[][] }> {
  const existing = inFlightReads.get(sheetKey);
  if (existing) return existing;

  const promise = withRetry(async () => {
    const sheets = await getSheetsClient();
    const spreadsheetId = SPREADSHEET_IDS[sheetKey]();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A1:ZZ100000',
    });
    const values = (res.data.values as string[][] | undefined) || [];
    const [header, ...rows] = values;
    return { header: header || [], rows };
  }).finally(() => {
    inFlightReads.delete(sheetKey);
  });

  inFlightReads.set(sheetKey, promise);
  return promise;
}

function rowsToObjects(header: string[], rows: string[][]): SheetRow[] {
  return rows
    .filter((r) => r.some((cell) => cell !== undefined && cell !== ''))
    .map((row) => {
      const obj: SheetRow = {};
      header.forEach((col, i) => {
        obj[col] = row[i] ?? '';
      });
      return obj;
    });
}

/** Ambil semua baris (tidak termasuk yang deleted_at terisi, kecuali includeDeleted true). */
export async function getAll(
  sheetKey: SheetKey,
  opts: { useCache?: boolean; includeDeleted?: boolean } = {}
): Promise<SheetRow[]> {
  const cacheKey = `sheet:${sheetKey}`;
  let all: SheetRow[] | undefined = opts.useCache !== false ? getCached<SheetRow[]>(cacheKey) : undefined;

  if (!all) {
    const { header, rows } = await readHeaderAndRows(sheetKey);
    all = rowsToObjects(header, rows);
    setCached(cacheKey, all, CACHE_TTL_MS);
  }

  if (opts.includeDeleted) return all;
  return all.filter((r) => !r.deleted_at);
}

export async function findById(
  sheetKey: SheetKey,
  id: string,
  opts: { useCache?: boolean; includeDeleted?: boolean } = {}
): Promise<SheetRow | undefined> {
  const all = await getAll(sheetKey, opts);
  return all.find((r) => r.id === id);
}

export async function findOne(
  sheetKey: SheetKey,
  predicate: (row: SheetRow) => boolean
): Promise<SheetRow | undefined> {
  const all = await getAll(sheetKey);
  return all.find(predicate);
}

export async function findMany(sheetKey: SheetKey, predicate: (row: SheetRow) => boolean): Promise<SheetRow[]> {
  const all = await getAll(sheetKey);
  return all.filter(predicate);
}

export async function insertRow(sheetKey: SheetKey, data: Record<string, string>): Promise<SheetRow> {
  const sheets = await getSheetsClient();
  const spreadsheetId = SPREADSHEET_IDS[sheetKey]();
  const { header } = await readHeaderAndRows(sheetKey);

  const id = data.id || randomUUID();
  const now = new Date().toISOString();
  const full: Record<string, string> = { ...data, id };
  if (header.includes('created_at') && !full.created_at) full.created_at = now;
  if (header.includes('updated_at') && !full.updated_at) full.updated_at = now;

  const row = header.map((col) => full[col] ?? '');

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  invalidateCache(`sheet:${sheetKey}`);

  const obj: SheetRow = {};
  header.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

/**
 * Perbaikan (permintaan user, item concurrency): dilempar oleh updateRow() kalau dipanggil
 * dengan `expectedUpdatedAt` dan baris di sheet ternyata sudah berubah (updated_at beda) sejak
 * client terakhir memuat datanya — tandanya ada user LAIN yang sudah menyimpan perubahan duluan.
 * Route handler menangkap error ini secara spesifik dan membalas 409 dengan pesan jelas, bukan
 * menimpa diam-diam (lost update) atau menjatuhkan request dengan 500 mentah.
 */
export class OptimisticLockError extends Error {
  sheetKey: string;
  id: string;
  constructor(sheetKey: string, id: string) {
    super(`Data pada ${sheetKey}/${id} sudah diubah oleh pihak lain sejak terakhir dimuat.`);
    this.name = 'OptimisticLockError';
    this.sheetKey = sheetKey;
    this.id = id;
  }
}

export async function updateRow(
  sheetKey: SheetKey,
  id: string,
  patch: Record<string, string>,
  opts: { expectedUpdatedAt?: string } = {}
): Promise<SheetRow | undefined> {
  const sheets = await getSheetsClient();
  const spreadsheetId = SPREADSHEET_IDS[sheetKey]();
  const { header, rows } = await readHeaderAndRows(sheetKey);
  const idColIndex = header.indexOf('id');
  if (idColIndex === -1) throw new Error(`Sheet ${sheetKey} tidak punya kolom "id".`);

  const rowIndex = rows.findIndex((r) => r[idColIndex] === id);
  if (rowIndex === -1) return undefined;

  const existing: Record<string, string> = {};
  header.forEach((col, i) => {
    existing[col] = rows[rowIndex][i] ?? '';
  });

  // Perbaikan (permintaan user, item concurrency — "beberapa user tidak sengaja melakukan update
  // data secara bersamaan"): sebelumnya updateRow SELALU baca-ubah-tulis tanpa pengecekan apa pun
  // — kalau 2 user menyimpan perubahan pada baris yang sama nyaris bersamaan, siapa pun yang
  // menulis PALING AKHIR menimpa TOTAL perubahan user sebelumnya tanpa jejak/peringatan (lost
  // update, silent data loss). Sekarang: kalau caller mengirim `expectedUpdatedAt` (nilai
  // updated_at yang dia lihat saat memuat data), dicek dulu terhadap nilai TERKINI di sheet
  // sebelum menulis — kalau beda (berarti sudah ada yang menyimpan duluan), tolak dengan
  // OptimisticLockError alih-alih menimpa. opts.expectedUpdatedAt OPSIONAL & dibiarkan tidak
  // memeriksa apa pun kalau tidak dikirim (backward-compatible untuk pemanggil yang belum
  // diperbarui, mis. update status via drag Kanban).
  if (
    opts.expectedUpdatedAt !== undefined &&
    header.includes('updated_at') &&
    existing.updated_at &&
    existing.updated_at !== opts.expectedUpdatedAt
  ) {
    throw new OptimisticLockError(sheetKey, id);
  }

  const now = new Date().toISOString();
  const merged: Record<string, string> = { ...existing, ...patch };
  if (header.includes('updated_at')) merged.updated_at = now;

  const newRow = header.map((col) => merged[col] ?? '');
  const sheetRowNumber = rowIndex + 2; // +1 karena header, +1 karena 1-indexed

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `A${sheetRowNumber}:${columnLetter(header.length)}${sheetRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [newRow] },
  });

  invalidateCache(`sheet:${sheetKey}`);
  return merged;
}

export async function softDeleteRow(sheetKey: SheetKey, id: string): Promise<void> {
  await updateRow(sheetKey, id, { deleted_at: new Date().toISOString() });
}
