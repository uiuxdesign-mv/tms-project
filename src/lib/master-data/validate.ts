import type { EntityConfig } from './config';
import * as SheetTable from '@/lib/google/sheet-table';

export type ValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
  /** Data yang sudah dinormalisasi (boolean -> "Ya"/"Tidak", trim string, dst) siap disimpan ke sheet. */
  data: Record<string, string>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validasi payload entity Master Data (Fase 7: sekarang async — sebelumnya sinkron — karena
 * menambahkan pengecekan keunikan nama/kode yang perlu query ke sheet).
 *
 * @param existing Baris yang sedang diedit (kalau ini PATCH), dipakai untuk (a) mengunci field
 *   `lockOnEdit` ke nilai lama, dan (b) mengecualikan baris ini sendiri dari cek keunikan.
 */
export async function validateEntityPayload(
  config: EntityConfig,
  input: Record<string, unknown>,
  existing?: SheetTable.SheetRow
): Promise<ValidationResult> {
  const errors: Record<string, string> = {};
  const data: Record<string, string> = {};

  for (const field of config.fields) {
    // Field terkunci: abaikan nilai dari client sepenuhnya, selalu pakai nilai lama — meniru
    // aplikasi lama yang merender field ini sebagai <div> read-only (bukan <input>) saat edit,
    // sehingga request yang dimanipulasi pun tidak bisa mengubahnya.
    if (field.lockOnEdit && existing) {
      data[field.key] = existing[field.key] ?? '';
      continue;
    }

    const raw = input[field.key];

    if (field.type === 'boolean') {
      data[field.key] = raw === true || raw === 'Ya' || raw === 'true' ? 'Ya' : 'Tidak';
      continue;
    }

    // Multi-select (mis. Project Terkait pada Client) — disimpan sebagai string ID dipisah koma
    // di satu sel sheet. Client mengirim array of string; terima juga string csv siap-pakai
    // (dipakai import CSV) supaya tidak perlu jalur terpisah.
    if (field.type === 'multiselect') {
      const arr = Array.isArray(raw)
        ? raw.map((v) => String(v).trim()).filter(Boolean)
        : typeof raw === 'string'
          ? raw.split(',').map((v) => v.trim()).filter(Boolean)
          : [];
      data[field.key] = arr.join(',');
      continue;
    }

    const strValue = raw === undefined || raw === null ? '' : String(raw).trim();

    if (field.required && !strValue) {
      errors[field.key] = `${field.label} wajib diisi.`;
      data[field.key] = '';
      continue;
    }

    if (field.type === 'email' && strValue && !EMAIL_RE.test(strValue)) {
      errors[field.key] = `${field.label} harus berupa email yang valid.`;
    }

    if (field.type === 'number' && strValue && Number.isNaN(Number(strValue))) {
      errors[field.key] = `${field.label} harus berupa angka.`;
    }

    if (field.pattern && strValue && !field.pattern.test(strValue)) {
      errors[field.key] = field.patternMessage || `${field.label} formatnya tidak valid.`;
    }

    data[field.key] = strValue;
  }

  // Cek keunikan (case-insensitive) untuk field yang ditandai unique — hanya kalau belum ada
  // error lain di field itu, dan nilainya tidak kosong.
  const uniqueFields = config.fields.filter((f) => f.unique && !errors[f.key] && data[f.key]);
  if (uniqueFields.length > 0) {
    const rows = await SheetTable.getAll(config.key);
    for (const field of uniqueFields) {
      const value = data[field.key].trim().toLowerCase();
      const dupe = rows.find(
        (r) => r.id !== existing?.id && (r[field.key] || '').trim().toLowerCase() === value
      );
      if (dupe) {
        errors[field.key] = `${field.label} "${data[field.key]}" sudah dipakai — harus unik.`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, data };
}
