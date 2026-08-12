import type { SheetKey } from '@/lib/google/spreadsheet-ids';

export type FieldType = 'text' | 'email' | 'textarea' | 'select' | 'boolean' | 'number' | 'date' | 'color';

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
  /** Teks kecil di bawah input, menjelaskan maksud/dampak field ini (Fase 12, sesuai video). */
  helperText?: string;
  /**
   * Field ini tidak ditampilkan sama sekali di form Tambah MAUPUN Edit (Fase 15) — dipakai untuk
   * `sort_order` Master Status, yang sekarang di-generate otomatis di server saat baris baru
   * dibuat, lalu diatur ulang langsung dari tabel lewat tombol naik/turun (bukan diketik manual).
   * Field ini TETAP ada di data model (tetap muncul di modal Detail serta Export/Import CSV) —
   * cuma disembunyikan dari form, nilainya tetap ikut terkirim transparan lewat formValues saat
   * Simpan (lihat openEditModal/handleMoveStatus di master-data-table.tsx).
   */
  hiddenInForm?: boolean;
  /**
   * Untuk type 'boolean' saja (Fase 12): cara menampilkannya di form.
   * - 'radio' (default lama): dua radio button Ya/Tidak.
   * - 'checkbox' : satu checkbox, label field dipakai sebagai teks di sampingnya.
   * - 'select'   : dropdown dua opsi custom (lihat `selectLabels`), dipetakan ke Ya/Tidak di balik layar.
   */
  displayAs?: 'radio' | 'checkbox' | 'select';
  /** Label custom untuk displayAs:'select' pada type 'boolean' — [label utk "Ya", label utk "Tidak"]. */
  selectLabels?: [string, string];
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
  /** Judul halaman (Fase 12) — sesuai video, cuma Role yang tetap pakai prefix "Master ". */
  pageTitle: string;
  /** Subjudul di bawah judul halaman, "{count}" diganti jumlah baris. */
  subtitleTemplate: string;
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
    pageTitle: 'Master Role',
    subtitleTemplate: '{count} roles total',
    fields: [
      { key: 'role_name', label: 'Nama Role', type: 'text', required: true, unique: true },
      { key: 'description', label: 'Deskripsi', type: 'textarea', showInTable: false },
      STATUS_FIELD,
      // role_key tetap ada di sheet & dipakai luas sebagai bypass permission admin (role_key ===
      // 'admin'), tapi TIDAK lagi ditampilkan sebagai input di form (Fase 12, sesuai video) — nilai
      // di-generate otomatis dari role_name di server (lihat src/app/api/master/roles/route.ts).
    ],
  },
  clients: {
    key: 'clients',
    label: 'Client',
    labelPlural: 'Clients',
    titleField: 'client_name',
    pageTitle: 'Client',
    subtitleTemplate: '{count} total records',
    fields: [
      { key: 'client_name', label: 'Nama Klien', type: 'text', required: true, unique: true },
      STATUS_FIELD,
    ],
  },
  projects: {
    key: 'projects',
    label: 'Project',
    labelPlural: 'Projects',
    titleField: 'project_name',
    pageTitle: 'Project',
    subtitleTemplate: '{count} total records',
    fields: [
      { key: 'project_name', label: 'Nama Proyek', type: 'text', required: true, unique: true },
      STATUS_FIELD,
    ],
  },
  priorities: {
    key: 'priorities',
    label: 'Priority',
    labelPlural: 'Priorities',
    titleField: 'priority_name',
    pageTitle: 'Priority',
    subtitleTemplate: '{count} total records',
    fields: [
      { key: 'priority_name', label: 'Nama Prioritas', type: 'text', required: true, unique: true },
      { key: 'level', label: 'Urutan (angka)', type: 'number', showInTable: false },
      {
        key: 'color_code',
        label: 'Kode Warna',
        type: 'color',
        showInTable: false,
        pattern: HEX_COLOR_PATTERN,
        patternMessage: HEX_COLOR_MESSAGE,
        helperText: 'Ditampilkan sebagai warna badge Priority.',
      },
      STATUS_FIELD,
    ],
  },
  task_types: {
    key: 'task_types',
    label: 'Task Type',
    labelPlural: 'Task Types',
    titleField: 'type_name',
    pageTitle: 'Task Type',
    subtitleTemplate: '{count} total records',
    fields: [
      { key: 'type_name', label: 'Nama Tipe Tugas', type: 'text', required: true, unique: true },
      {
        key: 'requires_related_task',
        label: 'Requires Related Task',
        type: 'boolean',
        displayAs: 'checkbox',
        helperText:
          'When checked, every task created or edited with this task type must select an existing task as its Related Task reference (e.g. a "Revision" type that points back to the task being revised).',
      },
      STATUS_FIELD,
    ],
  },
  employment_types: {
    key: 'employment_types',
    label: 'Employment Type',
    labelPlural: 'Employment Types',
    titleField: 'type_name',
    pageTitle: 'Employment Type',
    subtitleTemplate: '{count} total records',
    fields: [
      { key: 'type_name', label: 'Nama Tipe Kepegawaian', type: 'text', required: true, unique: true },
      {
        key: 'can_assign_to_others',
        label: 'May Assign Tasks to Other Users',
        type: 'boolean',
        displayAs: 'checkbox',
        helperText:
          'When enabled, this employment type is set as eligible to assign tasks to other users. Users with this employment type still need to be individually authorized via the "Is this user allowed to assign tasks to other users?" question on Master User.',
      },
      STATUS_FIELD,
    ],
  },
  statuses: {
    key: 'statuses',
    label: 'Status',
    labelPlural: 'Statuses',
    titleField: 'status_name',
    pageTitle: 'Status',
    subtitleTemplate: '{count} total records',
    fields: [
      { key: 'status_name', label: 'Nama Status', type: 'text', required: true, unique: true },
      {
        key: 'sort_order',
        label: 'Urutan',
        type: 'number',
        showInTable: false,
        // Fase 15 (permintaan user): tidak lagi diisi manual di form — lihat penjelasan lengkap
        // pada JSDoc `hiddenInForm` di FieldConfig atas.
        hiddenInForm: true,
      },
      {
        key: 'color_code',
        label: 'Kode Warna',
        type: 'color',
        showInTable: false,
        pattern: HEX_COLOR_PATTERN,
        patternMessage: HEX_COLOR_MESSAGE,
        helperText: 'Shown as the Kanban column / status badge color.',
      },
      {
        key: 'workflow_level',
        label: 'Urutan Workflow',
        type: 'number',
        showInTable: false,
        helperText:
          'Position in the linear workflow (1, 2, 3, ...) used to prevent level skipping (e.g. To Do → Complete). Leave blank for statuses like Cancelled that a task can enter/exit at any time.',
      },
      {
        key: 'is_default',
        label: 'Status Default (Awal Task Baru)',
        type: 'boolean',
        displayAs: 'checkbox',
        showInTable: false,
        helperText: 'Enabling this option will disable the default flag on the status that currently has it.',
      },
      {
        key: 'is_final',
        label: 'Final Status',
        type: 'boolean',
        displayAs: 'checkbox',
        showInTable: false,
        helperText: 'Final status (marks a task as complete).',
      },
      {
        key: 'is_review',
        label: 'Status Review (Time Tracking)',
        type: 'boolean',
        displayAs: 'checkbox',
        showInTable: false,
        helperText: 'Dipakai untuk memisahkan waktu kerja (Work) dan waktu review pada Time Tracking.',
      },
      {
        key: 'is_active',
        label: 'Status',
        type: 'boolean',
        required: true,
        displayAs: 'select',
        selectLabels: ['Active', 'Inactive'],
      },
    ],
  },
};

export function getEntityConfig(entityKey: string): EntityConfig | undefined {
  return MASTER_DATA_ENTITIES[entityKey];
}
