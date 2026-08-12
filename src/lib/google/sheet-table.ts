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

async function readHeaderAndRows(sheetKey: SheetKey): Promise<{ header: string[]; rows: string[][] }> {
  const sheets = await getSheetsClient();
  const spreadsheetId = SPREADSHEET_IDS[sheetKey]();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A1:ZZ100000',
  });
  const values = (res.data.values as string[][] | undefined) || [];
  const [header, ...rows] = values;
  return { header: header || [], rows };
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

export async function updateRow(
  sheetKey: SheetKey,
  id: string,
  patch: Record<string, string>
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
