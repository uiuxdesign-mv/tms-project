import * as SheetTable from '@/lib/google/sheet-table';
import type { EntityConfig } from './config';

export type SelectOption = { value: string; label: string };

/** Resolusi opsi dropdown untuk semua field bertipe 'select' pada satu entity config. */
export async function resolveFieldOptions(config: EntityConfig): Promise<Record<string, SelectOption[]>> {
  const result: Record<string, SelectOption[]> = {};

  for (const field of config.fields) {
    if (field.type !== 'select') continue;

    if (field.optionsStatic) {
      result[field.key] = field.optionsStatic.map((v) => ({ value: v, label: v }));
    } else if (field.optionsFrom) {
      const rows = await SheetTable.getAll(field.optionsFrom);
      result[field.key] = rows.map((r) => ({
        value: r.id,
        label: r[field.optionsLabelKey || 'name'] || r.id,
      }));
    }
  }

  return result;
}
