import type { SheetKey } from '@/lib/google/spreadsheet-ids';

export type FieldType = 'text' | 'email' | 'textarea' | 'select' | 'boolean' | 'number' | 'date';

export type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Untuk type 'select' yang opsinya diambil dari sheet lain (relasi). */
  optionsFrom?: SheetKey;
  /** Label yang ditampilkan di dropdown, diambil dari kolom ini pada sheet relasi. */
  optionsLabelKey?: string;
  /** Untuk type 'select' dengan opsi tetap (bukan dari sheet lain). */
  optionsStatic?: string[];
  /** Tampilkan sebagai kolom di tabel daftar. Default true. */
  showInTable?: boolean;
  /**
   * Field ini tidak boleh diubah lagi setelah baris dibuat (Fase 7) — dikunci baik di UI
   * (readonly saat mode edit) maupun di server (nilai baru dari client diabaikan, tetap pakai
   * nilai lama). Dipakai untuk role_key supaya tidak bisa merusak hardcoded roleKey==='admin'
   * yang dipakai di banyak tempat sebagai bypass permission.
   */
  lockOnEdit?: boolean;
  /** Nilai field ini harus unik (case-insensitive) di antara baris aktif entity ini (Fase 7). */
  unique?: boolean;
  /** Pola regex tambahan untuk validasi format (Fase 7, mis. slug role_key / hex color). */
  pattern?: RegExp;
  /** Pesan error kustom kalau pattern tidak cocok. */
  patternMessage?: string;
};

export type EntityConfig = {
  key: SheetKey;
  label: string;
  labelPlural: string;
  /** Kolom yang dipakai sebagai judul baris di konfirmasi hapus, dsb. */
  titleField: string;
  fields: FieldConfig[];
  /**
   * Nama kolom (bukan di `fields`, dikelola server) yang menandai baris "bawaan sistem" — kalau
   * bernilai "Ya", baris ini tidak bisa dihapus sama sekali, independen dari reference count
   * (Fase 7). Dipakai untuk role admin/manager/member, meniru is_system di aplikasi lama.
   */
  systemFlagField?: string;
};

const STATUS_FIELD: FieldConfig = {
  key: 'status',
  label: 'Status',
  type: 'select',
  required: true,
  optionsStatic: ['Active', 'Inactive'],
};

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const HEX_COLOR_MESSAGE = 'Kode warna harus format hex, mis. #2563eb atau #fff.';

export const MASTER_DATA_ENTITIES: Record<string, EntityConfig> = {
  roles: {
    key: 'roles',
    label: 'Role',
    labelPlural: 'Roles',
    titleField: 'role_name',
    systemFlagField: 'is_system',
    fields: [
      {
        key: 'role_key',
        label: 'Kode Role',
        type: 'text',
        required: true,
        lockOnEdit: true,
        unique: true,
        pattern: /^[a-z][a-z0-9_]*$/,
        patternMessage: 'Kode Role hanya boleh huruf kecil/angka/underscore, diawali huruf (mis. finance_lead).',
      },
      { key: 'role_name', label: 'Nama Role', type: 'text', required: true, unique: true },
      STATUS_FIELD,
    ],
  },
  clients: {
    key: 'clients',
    label: 'Client',
    labelPlural: 'Clients',
    titleField: 'client_name',
    fields: [
      { key: 'client_name', label: 'Nama Klien', type: 'text', required: true, unique: true },
      { key: 'contact_person', label: 'Kontak Person', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Telepon', type: 'text' },
      { key: 'address', label: 'Alamat', type: 'textarea', showInTable: false },
      STATUS_FIELD,
    ],
  },
  projects: {
    key: 'projects',
    label: 'Project',
    labelPlural: 'Projects',
    titleField: 'project_name',
    fields: [
      { key: 'project_name', label: 'Nama Proyek', type: 'text', required: true, unique: true },
      { key: 'client_id', label: 'Klien', type: 'select', required: true, optionsFrom: 'clients', optionsLabelKey: 'client_name' },
      { key: 'description', label: 'Deskripsi', type: 'textarea', showInTable: false },
      { key: 'start_date', label: 'Tanggal Mulai', type: 'date' },
      { key: 'end_date', label: 'Tanggal Selesai', type: 'date' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        optionsStatic: ['Active', 'Completed', 'On Hold', 'Cancelled'],
      },
    ],
  },
  priorities: {
    key: 'priorities',
    label: 'Priority',
    labelPlural: 'Priorities',
    titleField: 'priority_name',
    fields: [
      { key: 'priority_name', label: 'Nama Prioritas', type: 'text', required: true, unique: true },
      { key: 'level', label: 'Urutan (angka)', type: 'number' },
      { key: 'color_code', label: 'Kode Warna', type: 'text', showInTable: false, pattern: HEX_COLOR_PATTERN, patternMessage: HEX_COLOR_MESSAGE },
      STATUS_FIELD,
    ],
  },
  task_types: {
    key: 'task_types',
    label: 'Task Type',
    labelPlural: 'Task Types',
    titleField: 'type_name',
    fields: [
      { key: 'type_name', label: 'Nama Tipe Tugas', type: 'text', required: true, unique: true },
      { key: 'requires_related_task', label: 'Wajib Terhubung ke Task Lain', type: 'boolean' },
      STATUS_FIELD,
    ],
  },
  employment_types: {
    key: 'employment_types',
    label: 'Employment Type',
    labelPlural: 'Employment Types',
    titleField: 'type_name',
    fields: [
      { key: 'type_name', label: 'Nama Tipe Kepegawaian', type: 'text', required: true, unique: true },
      { key: 'can_assign_to_others', label: 'Boleh Menugaskan ke User Lain', type: 'boolean' },
      STATUS_FIELD,
    ],
  },
  statuses: {
    key: 'statuses',
    label: 'Status',
    labelPlural: 'Statuses',
    titleField: 'status_name',
    fields: [
      { key: 'status_name', label: 'Nama Status', type: 'text', required: true, unique: true },
      { key: 'sort_order', label: 'Urutan', type: 'number' },
      { key: 'color_code', label: 'Kode Warna', type: 'text', showInTable: false, pattern: HEX_COLOR_PATTERN, patternMessage: HEX_COLOR_MESSAGE },
      { key: 'is_final', label: 'Status Akhir', type: 'boolean' },
      {
        key: 'is_default',
        label: 'Status Default (Awal Task Baru)',
        type: 'boolean',
      },
      {
        key: 'workflow_level',
        label: 'Urutan Workflow',
        type: 'number',
      },
      {
        key: 'is_review',
        label: 'Status Review (Time Tracking)',
        type: 'boolean',
      },
      { key: 'is_active', label: 'Aktif', type: 'boolean', required: true },
    ],
  },
};

export function getEntityConfig(entityKey: string): EntityConfig | undefined {
  return MASTER_DATA_ENTITIES[entityKey];
}
