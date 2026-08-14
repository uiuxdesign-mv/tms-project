import type { SheetKey } from '@/lib/google/spreadsheet-ids';
import type { TranslationKey } from '@/lib/i18n/translations';

export type FieldType = 'text' | 'email' | 'textarea' | 'select' | 'multiselect' | 'boolean' | 'number' | 'date' | 'color';

export type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /**
   * Kunci terjemahan i18n untuk label/placeholder/helperText (permintaan user: sweep i18n
   * menyeluruh termasuk Master Data). Kalau diisi, dipakai lewat `t(...)` menggantikan string
   * mentah `label`/`placeholder`/`helperText` di atas — string mentah tetap dipertahankan sebagai
   * fallback/dokumentasi kalau suatu saat key-nya belum lengkap.
   */
  labelKey?: TranslationKey;
  placeholderKey?: TranslationKey;
  helperTextKey?: TranslationKey;
  /** Untuk type 'select'/'multiselect' yang opsinya diambil dari sheet lain (relasi). */
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
  /**
   * Teks contoh yang tampil samar di dalam field kosong (Fase 17, permintaan user: "Untuk Semua
   * field input, saya ingin terdapat placeholder contoh data yang harus diinputkan"). Dipakai untuk
   * type 'text' | 'email' | 'textarea' | 'number' | 'date' — bukan instruksi/label pengganti,
   * murni contoh nilai yang valid supaya user tahu format yang diharapkan.
   */
  placeholder?: string;
};

export type EntityConfig = {
  key: SheetKey;
  label: string;
  labelPlural: string;
  /** Kunci terjemahan i18n untuk label/labelPlural/pageTitle/subtitleTemplate — lihat catatan di
   *  FieldConfig di atas. subtitleTemplateKey tetap memakai literal "{count}" di nilainya. */
  labelKey?: TranslationKey;
  labelPluralKey?: TranslationKey;
  pageTitleKey?: TranslationKey;
  subtitleTemplateKey?: TranslationKey;
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
  labelKey: 'col_status',
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
    labelKey: 'md_entity_label_roles',
    labelPluralKey: 'nav_master_roles',
    titleField: 'role_name',
    systemFlagField: 'is_system',
    pageTitle: 'Master Role',
    pageTitleKey: 'md_title_roles',
    subtitleTemplate: '{count} roles total',
    subtitleTemplateKey: 'md_subtitle_roles',
    fields: [
      {
        key: 'role_name',
        label: 'Nama Role',
        labelKey: 'md_field_role_name',
        type: 'text',
        required: true,
        unique: true,
        placeholder: 'Contoh: Project Manager',
        placeholderKey: 'md_ph_role_name',
      },
      {
        key: 'description',
        label: 'Deskripsi',
        labelKey: 'td_field_description',
        type: 'textarea',
        showInTable: false,
        placeholder: 'Contoh: Mengelola proyek, menugaskan task, dan memantau progres tim.',
        placeholderKey: 'md_ph_role_description',
      },
      // Fitur Leader Role (permintaan user): role yang ditandai Pemimpin tidak bisa ditugaskan
      // task oleh siapa pun (setara Admin), otomatis boleh menugaskan task ke semua user kecuali
      // Admin (tidak perlu diatur lewat Employment Type seperti Manager), dan boleh melihat
      // SELURUH task user lain tapi murni view-only. Lihat aturan lengkap di
      // src/lib/models/tasks.ts (canViewTask/canManageTask/canAssignToOthers) dan
      // src/lib/models/roles.ts (isNonAssignableRole).
      {
        key: 'is_leader',
        label: 'Pemimpin (Leader)',
        labelKey: 'md_field_is_leader',
        type: 'boolean',
        displayAs: 'checkbox',
        helperText:
          'Role dengan tanda ini tidak bisa ditugaskan task oleh siapa pun, otomatis boleh menugaskan task ke semua user kecuali Admin, dan bisa melihat seluruh task user lain (view-only, tidak bisa mengubah apa pun).',
        helperTextKey: 'md_help_is_leader',
      },
      STATUS_FIELD,
      // role_key tetap ada di sheet & dipakai luas sebagai bypass permission admin (role_key ===
      // 'admin'), tapi TIDAK lagi ditampilkan sebagai input di form (Fase 12, sesuai video) — nilai
      // di-generate otomatis dari role_name di server (lihat src/app/api/master/roles/route.ts).
    ],
  },
  employment_types: {
    key: 'employment_types',
    label: 'Employment Type',
    labelPlural: 'Employment Types',
    labelKey: 'md_entity_label_employment_types',
    labelPluralKey: 'nav_master_employment_types',
    titleField: 'type_name',
    pageTitle: 'Employment Type',
    pageTitleKey: 'md_title_employment_types',
    subtitleTemplate: '{count} total records',
    subtitleTemplateKey: 'md_subtitle_generic',
    fields: [
      {
        key: 'type_name',
        label: 'Nama Tipe Kepegawaian',
        labelKey: 'md_field_employment_type_name',
        type: 'text',
        required: true,
        unique: true,
        placeholder: 'Contoh: Full-time',
        placeholderKey: 'md_ph_employment_type_name',
      },
      {
        key: 'can_assign_to_others',
        label: 'May Assign Tasks to Other Users',
        labelKey: 'md_field_can_assign_others',
        type: 'boolean',
        displayAs: 'checkbox',
        helperText:
          'When enabled, this employment type is set as eligible to assign tasks to other users. Users with this employment type still need to be individually authorized via the "Is this user allowed to assign tasks to other users?" question on Master User.',
        helperTextKey: 'md_help_can_assign_others',
      },
      STATUS_FIELD,
    ],
  },
  clients: {
    key: 'clients',
    label: 'Client',
    labelPlural: 'Clients',
    labelKey: 'md_entity_label_clients',
    labelPluralKey: 'nav_master_clients',
    titleField: 'client_name',
    pageTitle: 'Client',
    pageTitleKey: 'md_title_clients',
    subtitleTemplate: '{count} total records',
    subtitleTemplateKey: 'md_subtitle_generic',
    fields: [
      {
        key: 'client_name',
        label: 'Nama Klien',
        labelKey: 'md_field_client_name',
        type: 'text',
        required: true,
        unique: true,
        placeholder: 'Contoh: PT Maju Bersama',
        placeholderKey: 'md_ph_client_name',
      },
      {
        key: 'project_ids',
        label: 'Project Terkait',
        labelKey: 'md_field_project_ids',
        type: 'multiselect',
        optionsFrom: 'projects',
        optionsLabelKey: 'project_name',
        showInTable: false,
        helperText:
          'Pilih project yang terkait dengan client ini. Saat menambah Task, pilihan Project akan otomatis terfilter berdasarkan Client yang dipilih.',
        helperTextKey: 'md_help_project_ids',
      },
      STATUS_FIELD,
    ],
  },
  projects: {
    key: 'projects',
    label: 'Project',
    labelPlural: 'Projects',
    labelKey: 'md_entity_label_projects',
    labelPluralKey: 'nav_master_projects',
    titleField: 'project_name',
    pageTitle: 'Project',
    pageTitleKey: 'md_title_projects',
    subtitleTemplate: '{count} total records',
    subtitleTemplateKey: 'md_subtitle_generic',
    fields: [
      {
        key: 'project_name',
        label: 'Nama Proyek',
        labelKey: 'md_field_project_name',
        type: 'text',
        required: true,
        unique: true,
        placeholder: 'Contoh: Website Redesign 2026',
        placeholderKey: 'md_ph_project_name',
      },
      STATUS_FIELD,
    ],
  },
  priorities: {
    key: 'priorities',
    label: 'Priority',
    labelPlural: 'Priorities',
    labelKey: 'md_entity_label_priorities',
    labelPluralKey: 'nav_master_priorities',
    titleField: 'priority_name',
    pageTitle: 'Priority',
    pageTitleKey: 'md_title_priorities',
    subtitleTemplate: '{count} total records',
    subtitleTemplateKey: 'md_subtitle_generic',
    fields: [
      {
        key: 'priority_name',
        label: 'Nama Prioritas',
        labelKey: 'md_field_priority_name',
        type: 'text',
        required: true,
        unique: true,
        placeholder: 'Contoh: Urgent',
        placeholderKey: 'md_ph_priority_name',
      },
      {
        key: 'level',
        label: 'Urutan (angka)',
        labelKey: 'md_field_level',
        type: 'number',
        showInTable: false,
        placeholder: 'Contoh: 1',
        placeholderKey: 'md_ph_level',
      },
      {
        key: 'color_code',
        label: 'Kode Warna',
        labelKey: 'md_field_color_code',
        type: 'color',
        showInTable: false,
        pattern: HEX_COLOR_PATTERN,
        patternMessage: HEX_COLOR_MESSAGE,
        helperText: 'Ditampilkan sebagai warna badge Priority.',
        helperTextKey: 'md_help_color_priority',
      },
      STATUS_FIELD,
    ],
  },
  task_types: {
    key: 'task_types',
    label: 'Task Type',
    labelPlural: 'Task Types',
    labelKey: 'md_entity_label_task_types',
    labelPluralKey: 'nav_master_task_types',
    titleField: 'type_name',
    pageTitle: 'Task Type',
    pageTitleKey: 'md_title_task_types',
    subtitleTemplate: '{count} total records',
    subtitleTemplateKey: 'md_subtitle_generic',
    fields: [
      {
        key: 'type_name',
        label: 'Nama Tipe Tugas',
        labelKey: 'md_field_task_type_name',
        type: 'text',
        required: true,
        unique: true,
        placeholder: 'Contoh: Bug Fix',
        placeholderKey: 'md_ph_task_type_name',
      },
      {
        key: 'requires_related_task',
        label: 'Requires Related Task',
        labelKey: 'md_field_requires_related_task',
        type: 'boolean',
        displayAs: 'checkbox',
        helperText:
          'When checked, every task created or edited with this task type must select an existing task as its Related Task reference (e.g. a "Revision" type that points back to the task being revised).',
        helperTextKey: 'md_help_requires_related_task',
      },
      STATUS_FIELD,
    ],
  },
  statuses: {
    key: 'statuses',
    label: 'Status',
    labelPlural: 'Statuses',
    labelKey: 'col_status',
    labelPluralKey: 'nav_master_statuses',
    titleField: 'status_name',
    pageTitle: 'Status',
    pageTitleKey: 'md_title_statuses',
    subtitleTemplate: '{count} total records',
    subtitleTemplateKey: 'md_subtitle_generic',
    fields: [
      {
        key: 'status_name',
        label: 'Nama Status',
        labelKey: 'md_field_status_name',
        type: 'text',
        required: true,
        unique: true,
        placeholder: 'Contoh: In Progress',
        placeholderKey: 'md_ph_status_name',
      },
      {
        key: 'sort_order',
        label: 'Urutan',
        labelKey: 'md_field_sort_order',
        type: 'number',
        showInTable: false,
        // Fase 15 (permintaan user): tidak lagi diisi manual di form — lihat penjelasan lengkap
        // pada JSDoc `hiddenInForm` di FieldConfig atas.
        hiddenInForm: true,
      },
      {
        key: 'color_code',
        label: 'Kode Warna',
        labelKey: 'md_field_color_code',
        type: 'color',
        showInTable: false,
        pattern: HEX_COLOR_PATTERN,
        patternMessage: HEX_COLOR_MESSAGE,
        helperText: 'Shown as the Kanban column / status badge color.',
        helperTextKey: 'md_help_color_status',
      },
      {
        key: 'workflow_level',
        label: 'Urutan Workflow',
        labelKey: 'md_field_workflow_level',
        type: 'number',
        showInTable: false,
        placeholder: 'Contoh: 1 (kosongkan utk status seperti Cancelled)',
        placeholderKey: 'md_ph_workflow_level',
        helperText:
          'Position in the linear workflow (1, 2, 3, ...) used to prevent level skipping (e.g. To Do → Complete). Leave blank for statuses like Cancelled that a task can enter/exit at any time.',
        helperTextKey: 'md_help_workflow_level',
      },
      {
        key: 'is_default',
        label: 'Status Default (Awal Task Baru)',
        labelKey: 'md_field_is_default',
        type: 'boolean',
        displayAs: 'checkbox',
        showInTable: false,
        helperText: 'Enabling this option will disable the default flag on the status that currently has it.',
        helperTextKey: 'md_help_is_default',
      },
      {
        key: 'is_final',
        label: 'Final Status',
        labelKey: 'md_field_is_final',
        type: 'boolean',
        displayAs: 'checkbox',
        showInTable: false,
        helperText: 'Final status (marks a task as complete).',
        helperTextKey: 'md_help_is_final',
      },
      {
        key: 'is_review',
        label: 'Status Review (Time Tracking)',
        labelKey: 'md_field_is_review',
        type: 'boolean',
        displayAs: 'checkbox',
        showInTable: false,
        helperText: 'Dipakai untuk memisahkan waktu kerja (Work) dan waktu review pada Time Tracking.',
        helperTextKey: 'md_help_is_review',
      },
      {
        key: 'is_active',
        label: 'Status',
        labelKey: 'col_status',
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
