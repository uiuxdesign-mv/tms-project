/**
 * Util CSV ringan untuk fitur Import/Export Master Data (Fase 5) — sengaja tidak pakai
 * library eksternal (parsing CSV kebutuhan di sini sederhana: koma, kutip dua, newline).
 * Aman dipakai di komponen client maupun server.
 */

/** Parse teks CSV jadi array baris (array of array of string). Mendukung field berkutip dua
 * yang berisi koma/newline/kutip-dua-ganda ("" untuk escape kutip literal), sesuai RFC 4180. */
export function parseCsv(text: string): string[][] {
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1); // buang BOM kalau ada

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (c === '\r') {
      i += 1;
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += c;
      i += 1;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Buang baris yang benar-benar kosong (mis. baris terakhir kosong karena file diakhiri newline).
  return rows.filter((r) => !(r.length <= 1 && (r[0] ?? '').trim() === ''));
}

export function toCsvValue(v: string | null | undefined): string {
  if (v == null) return '';
  const needsQuote = /[",\n]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function buildCsv(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(toCsvValue).join(',')).join('\n'); // BOM biar Excel baca UTF-8 dengan benar
}

/** Trigger download file CSV dari browser (harus dipanggil dari client component). */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
